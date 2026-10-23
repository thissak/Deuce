import { beforeEach, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { makeTestApp } from './api-helpers.js'
import { resetDb, testDb } from './helpers.js'

beforeEach(resetDb)

async function setup() {
  const { app, loginAs } = await makeTestApp()
  const owner = await loginAs('a@goldenlabs.dev', 'A')
  const peer = await loginAs('b@goldenlabs.dev', 'B')
  const peerId = (await app.inject({ url: '/auth/me', headers: { cookie: peer } })).json().id as string
  const room = async (type: 'channel' | 'group', title: string) => (await app.inject({ method: 'POST', url: '/api/conversations',
    headers: { cookie: owner }, payload: { type, title, memberIds: [peerId] } })).json() as { id: string }
  const connect = async (conversationId: string, name = 'Lexus Claude', cookie = owner) =>
    app.inject({ method: 'POST', url: `/api/conversations/${conversationId}/agents`, headers: { cookie }, payload: { name } })
  return { app, owner, peer, peerId, room, connect }
}

it('방 멤버가 AI 세션을 연결하면 키를 한 번 받고, 방에 연결 공지가 남으며, 해제는 소유자만 한다', async () => {
  const { app, owner, peer, room, connect } = await setup()
  try {
    const c = await room('channel', '빌드 알림')
    const created = await connect(c.id)
    expect(created.statusCode).toBe(201)
    expect(created.headers['cache-control']).toBe('no-store')
    const key = created.json()
    expect(key.token).toMatch(/^deuce_[A-Za-z0-9_-]{43}$/)
    const stored = await testDb.agentConnection.findUniqueOrThrow({ where: { id: key.id } })
    expect(stored.tokenHash).not.toContain(key.token)

    const listed = await app.inject({ url: `/api/conversations/${c.id}/agents`, headers: { cookie: peer } })
    expect(listed.json()).toMatchObject([{ id: key.id, name: 'Lexus Claude', ownerName: 'A', editable: false }])
    expect(JSON.stringify(listed.json())).not.toContain('deuce_')

    const history = (await app.inject({ url: `/api/conversations/${c.id}/messages`, headers: { cookie: peer } })).json()
    expect(history.items[0]).toMatchObject({ system: true, body: expect.stringContaining('Lexus Claude') })
    const summary = (await app.inject({ url: '/api/conversations', headers: { cookie: peer } })).json()
      .find((x: { id: string }) => x.id === c.id)
    expect(summary.members.some((m: { name: string }) => m.name === 'Lexus Claude')).toBe(false)

    expect((await app.inject({ method: 'DELETE', url: `/api/conversations/${c.id}/agents/${key.id}`, headers: { cookie: peer } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'DELETE', url: `/api/conversations/${c.id}/agents/${key.id}`, headers: { cookie: owner } })).statusCode).toBe(204)
    expect((await app.inject({ url: '/api/agent/conversation', headers: { authorization: `Bearer ${key.token}` } })).statusCode).toBe(401)
    expect((await app.inject({ url: `/api/conversations/${c.id}/agents`, headers: { cookie: owner } })).json()).toEqual([])
  } finally { await app.close() }
})

it('1:1 대화와 방 밖 사용자는 AI 세션을 연결할 수 없다', async () => {
  const { app, owner, peerId, room, connect, peer } = await setup()
  try {
    const dm = (await app.inject({ method: 'POST', url: '/api/conversations', headers: { cookie: owner }, payload: { type: 'dm', otherUserId: peerId } })).json()
    expect((await connect(dm.id)).statusCode).toBe(400)
    const own = (await app.inject({ method: 'POST', url: '/api/conversations', headers: { cookie: owner },
      payload: { type: 'channel', title: '혼자', memberIds: [] } })).json()
    expect((await connect(own.id, 'X', peer)).statusCode).toBe(403)
    const g = await room('group', '그룹')
    expect((await connect(g.id, '')).statusCode).toBe(400)
    expect((await connect(g.id)).statusCode).toBe(201)
  } finally { await app.close() }
})

it('AI API는 연결한 방만 읽고 쓰며, 이메일을 주지 않고, after 이후 새 글만 돌려준다', async () => {
  const { app, owner, peer, room, connect } = await setup()
  try {
    const c = await room('channel', '작업방')
    const other = await room('channel', '다른 방')
    const auth = { authorization: `Bearer ${(await connect(c.id)).json().token}` }
    const conversation = (await app.inject({ url: '/api/agent/conversation', headers: auth })).json()
    expect(conversation).toMatchObject({ id: c.id, title: '작업방' })
    expect(JSON.stringify(conversation)).not.toContain('@goldenlabs.dev')

    const posted = await app.inject({ method: 'POST', url: '/api/agent/messages', headers: auth, payload: { body: '빌드 완료' } })
    expect(posted.statusCode).toBe(201)
    const human = (await app.inject({ url: `/api/conversations/${c.id}/messages`, headers: { cookie: peer } })).json()
    expect(human.items[0]).toMatchObject({ body: '빌드 완료', author: { name: 'Lexus Claude', isAgent: true } })

    const latest = (await app.inject({ url: '/api/agent/messages', headers: auth })).json()
    expect(latest.items.map((m: { body: string }) => m.body).at(-1)).toBe('빌드 완료')
    expect(latest.lastMessageId).toBe(posted.json().id)
    expect(JSON.stringify(latest)).not.toContain('@goldenlabs.dev')

    await app.inject({ method: 'POST', url: `/api/conversations/${c.id}/messages`, headers: { cookie: owner }, payload: { body: '확인했어요, 배포 진행' } })
    const newer = (await app.inject({ url: `/api/agent/messages?after=${latest.lastMessageId}`, headers: auth })).json()
    expect(newer.items.map((m: { body: string }) => m.body)).toEqual(['확인했어요, 배포 진행'])
    const none = (await app.inject({ url: `/api/agent/messages?after=${newer.lastMessageId}`, headers: auth })).json()
    expect(none).toEqual({ items: [], lastMessageId: newer.lastMessageId })

    const foreign = (await app.inject({ method: 'POST', url: `/api/conversations/${other.id}/messages`, headers: { cookie: owner }, payload: { body: '다른 방 글' } })).json()
    expect((await app.inject({ url: `/api/agent/messages?after=${foreign.id}`, headers: auth })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/api/agent/messages', headers: auth, payload: { body: '인용', replyToId: foreign.id } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/api/agent/messages', headers: auth, payload: { body: '  ' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/api/agent/messages', headers: auth, payload: { body: 'x', conversationId: other.id } })).statusCode).toBe(400)

    // AI 키는 사람 API에서 쓰이지 않는다.
    expect((await app.inject({ url: '/api/conversations', headers: auth })).statusCode).toBe(401)
    // 소유자가 방을 나가면 키도 그 방에서 쓸 수 없다.
    await testDb.conversationMember.deleteMany({ where: { conversationId: c.id, user: { email: 'a@goldenlabs.dev' } } })
    expect((await app.inject({ url: '/api/agent/conversation', headers: auth })).statusCode).toBe(401)
  } finally { await app.close() }
})

const headers = { accept: 'application/json, text/event-stream', 'content-type': 'application/json' }
const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }
const unpack = (result: any) => JSON.parse(result.content[0].text)

it('실제 HTTP MCP 클라이언트로 방을 읽고 쓰며, 실패 이유와 해제를 즉시 반영한다', async () => {
  const { app, owner, room, connect } = await setup()
  const client = new Client({ name: 'claude-code-test', version: '1' })
  try {
    const c = await room('channel', 'MCP 방')
    const key = (await connect(c.id)).json()
    const url = await app.listen({ host: '127.0.0.1', port: 0 })
    await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { authorization: `Bearer ${key.token}` } } }))
    expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual(['get_conversation', 'post_message', 'read_messages'])
    expect(unpack(await client.callTool({ name: 'get_conversation' })).title).toBe('MCP 방')
    const first = unpack(await client.callTool({ name: 'read_messages', arguments: {} }))
    const posted = unpack(await client.callTool({ name: 'post_message', arguments: { body: '감독님, 패키징이 끝났습니다.' } }))
    const after = unpack(await client.callTool({ name: 'read_messages', arguments: { after: first.lastMessageId } }))
    expect(after.items.map((m: { id: string }) => m.id)).toEqual([posted.id])

    const failed = await client.callTool({ name: 'read_messages', arguments: { after: '00000000-0000-4000-8000-000000000000' } })
    expect(failed.isError).toBe(true)
    expect(JSON.stringify(failed.content)).toContain('400: unknown after message')

    await app.inject({ method: 'DELETE', url: `/api/conversations/${c.id}/agents/${key.id}`, headers: { cookie: owner } })
    await expect(client.listTools()).rejects.toThrow()
  } finally { await client.close(); await app.close() }
})

it('원격 MCP는 쿠키·쿼리 키·외부 Origin을 거부하고 상태 없는 JSON 응답만 쓴다', async () => {
  const { app, owner, room, connect } = await setup()
  try {
    const c = await room('channel', '권한 확인')
    const key = (await connect(c.id)).json()
    const authorization = `Bearer ${key.token}`
    const call = (extra: Record<string, string> = {}, payload: unknown = initialize, url = '/mcp') =>
      app.inject({ method: 'POST', url, headers: { ...headers, ...extra }, payload: JSON.stringify(payload) })
    expect((await call()).statusCode).toBe(401)
    expect((await call({ cookie: owner })).statusCode).toBe(401)
    expect((await call({}, initialize, `/mcp?token=${key.token}`)).statusCode).toBe(401)
    for (const origin of ['https://evil.example', 'null']) expect((await call({ authorization, origin })).statusCode).toBe(403)
    const init = await call({ authorization })
    expect(init.statusCode).toBe(200)
    expect(init.headers['mcp-session-id']).toBeUndefined()
    expect(init.json().result.serverInfo.name).toBe('deuce')
    expect((await app.inject({ method: 'GET', url: '/mcp', headers: { authorization } })).statusCode).toBe(405)
    expect((await call({ authorization }, { ...initialize, padding: 'x'.repeat(65536) })).statusCode).toBe(413)
    await testDb.agentConnection.update({ where: { id: key.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await call({ authorization })).statusCode).toBe(401)
  } finally { await app.close() }
})

it('소유자가 방을 나가거나 AI 멤버가 제거되면 키를 회수하고, 다시 들어와도 되살리지 않는다', async () => {
  const { app, owner, peer, room, connect } = await setup()
  try {
    const c = await room('channel', '회수 확인')
    const ownerId = (await app.inject({ url: '/auth/me', headers: { cookie: owner } })).json().id as string
    const first = (await connect(c.id)).json()
    expect((await app.inject({ method: 'DELETE', url: `/api/conversations/${c.id}/members/${ownerId}`, headers: { cookie: peer } })).statusCode).toBe(200)
    expect((await testDb.agentConnection.findUniqueOrThrow({ where: { id: first.id } })).revokedAt).not.toBeNull()
    await app.inject({ method: 'POST', url: `/api/conversations/${c.id}/members`, headers: { cookie: peer }, payload: { userIds: [ownerId] } })
    expect((await app.inject({ url: '/api/agent/conversation', headers: { authorization: `Bearer ${first.token}` } })).statusCode).toBe(401)
    expect((await app.inject({ url: `/api/conversations/${c.id}/agents`, headers: { cookie: owner } })).json()).toEqual([])

    const second = (await connect(c.id)).json()
    const agentUserId = (await testDb.agentConnection.findUniqueOrThrow({ where: { id: second.id } })).userId
    expect((await app.inject({ method: 'DELETE', url: `/api/conversations/${c.id}/members/${agentUserId}`, headers: { cookie: peer } })).statusCode).toBe(200)
    expect((await app.inject({ url: '/api/agent/conversation', headers: { authorization: `Bearer ${second.token}` } })).statusCode).toBe(401)
    expect((await app.inject({ url: `/api/conversations/${c.id}/agents`, headers: { cookie: owner } })).json()).toEqual([])

    const third = (await connect(c.id)).json()
    expect((await app.inject({ method: 'DELETE', url: `/api/conversations/${c.id}/members/me`, headers: { cookie: owner } })).statusCode).toBe(204)
    expect((await testDb.agentConnection.findUniqueOrThrow({ where: { id: third.id } })).revokedAt).not.toBeNull()
  } finally { await app.close() }
})

it('동시에 두 번 해제해도 한 번만 처리하고 공지도 한 번만 남긴다', async () => {
  const { app, owner, room, connect } = await setup()
  try {
    const c = await room('channel', '중복 해제')
    const key = (await connect(c.id)).json()
    const url = `/api/conversations/${c.id}/agents/${key.id}`
    const results = await Promise.all([1, 2].map(() => app.inject({ method: 'DELETE', url, headers: { cookie: owner } })))
    expect(results.map((r) => r.statusCode).sort()).toEqual([204, 404])
    expect(await testDb.message.count({ where: { conversationId: c.id, system: true, body: { contains: '해제' } } })).toBe(1)
  } finally { await app.close() }
})
