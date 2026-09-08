import { beforeEach, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { makeTestApp } from './api-helpers.js'
import { resetDb, testDb } from './helpers.js'

beforeEach(resetDb)
async function setup() {
  const { app, loginAs } = await makeTestApp()
  const owner = await loginAs('a@goldenlabs.dev')
  const peer = await loginAs('b@goldenlabs.dev')
  async function channel(cookie: string, title: string) {
    const c = (await app.inject({ method: 'POST', url: '/api/conversations', headers: { cookie }, payload: { type: 'channel', title, memberIds: [] } })).json()
    const key = (await app.inject({ method: 'POST', url: `/api/conversations/${c.id}/agents`, headers: { cookie }, payload: { name: `${title} AI` } })).json()
    return { c, key, authorization: `Bearer ${key.token}` }
  }
  return { app, owner, peer, channel }
}
const headers = { accept: 'application/json, text/event-stream', 'content-type': 'application/json' }
const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }
const unpack = (result: any) => JSON.parse(result.content[0].text)

it('실제 HTTP MCP 클라이언트 두 명이 서로 다른 채널을 읽고 게시하며 키 상태를 매번 검사한다', async () => {
  const { app, owner, peer, channel } = await setup()
  const clients: Client[] = []
  try {
    const a = await channel(owner, '첫 채널'); const b = await channel(peer, '둘째 채널')
    const url = await app.listen({ host: '127.0.0.1', port: 0 })
    for (const item of [a, b]) {
      const client = new Client({ name: 'remote-test', version: '1' })
      clients.push(client)
      await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { authorization: item.authorization } } }))
      expect((await client.listTools()).tools).toHaveLength(7)
    }
    const [ca, cb] = clients as [Client, Client]
    const contexts = await Promise.all(clients.map((c) => c.callTool({ name: 'get_channel' })))
    expect(contexts.map(unpack).map((c) => c.title)).toEqual(['첫 채널', '둘째 채널'])
    const posted = unpack(await ca.callTool({ name: 'post_message', arguments: { body: '첫 채널의 요구사항' } }))
    expect(unpack(await ca.callTool({ name: 'search_messages', arguments: { query: '요구사항' } })).items[0]).toMatchObject({ id: posted.id, author: { isAgent: true } })
    expect(unpack(await cb.callTool({ name: 'read_messages', arguments: {} })).items).toEqual([])
    expect((await cb.callTool({ name: 'post_message', arguments: { body: '채널 침범', replyToId: posted.id } })).isError).toBe(true)
    expect((await ca.callTool({ name: 'post_message', arguments: { body: '' } })).isError).toBe(true)
    const human = await app.inject({ url: `/api/conversations/${a.c.id}/messages`, headers: { cookie: owner } })
    expect(human.json().items[0].body).toBe('첫 채널의 요구사항')
    await app.inject({ method: 'DELETE', url: `/api/conversations/${a.c.id}/agents/${a.key.id}`, headers: { cookie: owner } })
    await expect(ca.listTools()).rejects.toThrow()
    expect(unpack(await cb.callTool({ name: 'get_channel' })).title).toBe('둘째 채널')
    await testDb.conversationMember.deleteMany({ where: { conversationId: b.c.id, user: { email: 'b@goldenlabs.dev' } } })
    await expect(cb.listTools()).rejects.toThrow()
  } finally { await Promise.all(clients.map((c) => c.close())); await app.close() }
})

it('원격 MCP는 쿠키·쿼리 키·외부 Origin을 거부하고 표준 HTTP 응답을 유지한다', async () => {
  const { app, owner, channel } = await setup()
  try {
    const a = await channel(owner, '권한 확인')
    const call = (extra: Record<string, string> = {}, payload: unknown = initialize, url = '/mcp') => app.inject({ method: 'POST', url, headers: { ...headers, ...extra }, payload: JSON.stringify(payload) })
    expect((await call()).statusCode).toBe(401)
    expect((await call({ cookie: owner })).statusCode).toBe(401)
    expect((await call({}, initialize, `/mcp?token=${a.key.token}`)).statusCode).toBe(401)
    for (const origin of ['https://evil.example', 'null']) expect((await call({ authorization: a.authorization, origin })).statusCode).toBe(403)
    const init = await call({ authorization: a.authorization, origin: 'http://localhost:4000' })
    expect(init.statusCode).toBe(200)
    expect(init.headers['mcp-session-id']).toBeUndefined()
    expect(init.headers['cache-control']).toBe('no-store')
    expect(init.json().result.serverInfo.name).toBe('deuce-channel')
    expect((await call({ authorization: a.authorization }, { jsonrpc: '2.0', method: 'notifications/initialized' })).statusCode).toBe(202)
    expect((await call({ authorization: a.authorization, 'mcp-protocol-version': 'invalid' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).statusCode).toBe(400)
    expect((await call({ authorization: a.authorization }, [initialize, initialize])).statusCode).toBe(400)
    expect((await call({ authorization: a.authorization }, { ...initialize, padding: 'x'.repeat(65536) })).statusCode).toBe(413)
    for (const method of ['GET', 'DELETE'] as const) expect((await app.inject({ method, url: '/mcp', headers: { authorization: a.authorization } })).statusCode).toBe(405)
    await testDb.agentConnection.update({ where: { id: a.key.id }, data: { expiresAt: new Date(0) } })
    expect((await call({ authorization: a.authorization })).statusCode).toBe(401)
  } finally { await app.close() }
})

it('도구 목록 요청도 연결별 속도 제한을 적용한다', async () => {
  const { app, owner, channel } = await setup()
  try {
    const a = await channel(owner, '속도 제한')
    for (let i = 0; i < 120; i++) {
      const res = await app.inject({ method: 'POST', url: '/mcp', headers: { ...headers, authorization: a.authorization }, payload: { jsonrpc: '2.0', id: i, method: 'tools/list' } })
      expect(res.statusCode).toBe(200)
    }
    expect((await app.inject({ method: 'POST', url: '/mcp', headers: { ...headers, authorization: a.authorization }, payload: initialize })).statusCode).toBe(429)
  } finally { await app.close() }
})

it('개인 MCP 하나로 Seo 대화를 찾아 인용 답장하고 해제 후 같은 클라이언트의 접근을 차단한다', async () => {
  const { app, owner, peer } = await setup()
  const client = new Client({ name: 'personal-agent-test', version: '1' })
  try {
    const b = await testDb.user.findUniqueOrThrow({ where: { email: 'b@goldenlabs.dev' } })
    await testDb.user.update({ where: { id: b.id }, data: { name: 'Adam Seo' } })
    const dm = (await app.inject({ method: 'POST', url: '/api/conversations', headers: { cookie: owner }, payload: { type: 'dm', otherUserId: b.id } })).json()
    const question = (await app.inject({ method: 'POST', url: `/api/conversations/${dm.id}/messages`, headers: { cookie: peer }, payload: { body: '어떻게 이미지를 보내나요?' } })).json()
    const agent = (await app.inject({ method: 'POST', url: '/api/agents', headers: { cookie: owner }, payload: { name: '개인 Codex', scope: 'ALL' } })).json()
    const url = await app.listen({ host: '127.0.0.1', port: 0 })
    await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { authorization: `Bearer ${agent.token}` } } }))
    const list = unpack(await client.callTool({ name: 'list_conversations', arguments: {} }))
    expect(list.items).toEqual([expect.objectContaining({ id: dm.id, displayName: 'Adam Seo', type: 'DM' })])
    expect(unpack(await client.callTool({ name: 'get_conversation', arguments: { conversationId: dm.id } })).displayName).toBe('Adam Seo')
    expect(unpack(await client.callTool({ name: 'read_messages', arguments: { conversationId: dm.id } })).items[0].id).toBe(question.id)
    expect(unpack(await client.callTool({ name: 'search_messages', arguments: { conversationId: dm.id, query: '이미지' } })).items[0].id).toBe(question.id)
    expect((await client.callTool({ name: 'post_message', arguments: { body: '잘못된 목적지 추정' } })).isError).toBe(true)
    const reply = unpack(await client.callTool({ name: 'post_message', arguments: { conversationId: dm.id, body: '입력창에 이미지를 붙여넣고 보내기를 누르세요.', replyToId: question.id } }))
    expect(reply.conversationId).toBe(dm.id)
    await app.inject({ method: 'PUT', url: `/api/conversations/${dm.id}/agents/${agent.id}`, headers: { cookie: owner }, payload: { excluded: true } })
    expect(unpack(await client.callTool({ name: 'list_conversations', arguments: {} })).items).toEqual([])
    expect((await client.callTool({ name: 'read_messages', arguments: { conversationId: dm.id } })).isError).toBe(true)
    expect((await client.callTool({ name: 'post_message', arguments: { conversationId: dm.id, body: '해제 후 답장' } })).isError).toBe(true)
  } finally { await client.close(); await app.close() }
})
