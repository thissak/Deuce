import { beforeEach, expect, it } from 'vitest'
import { makeTestApp } from './api-helpers.js'
import { resetDb, testDb } from './helpers.js'
import { randomUUID } from 'node:crypto'

beforeEach(resetDb)

it('개인 에이전트의 참여 범위를 채널에서 모든 대화로 바꾸고 방별 제외를 우선한다', async () => {
  const { app, loginAs } = await makeTestApp()
  try {
    const owner = await loginAs('a@goldenlabs.dev')
    await loginAs('b@goldenlabs.dev')
    const peer = await testDb.user.findUniqueOrThrow({ where: { email: 'b@goldenlabs.dev' } })
    const channel = (await app.inject({ method: 'POST', url: '/api/conversations', headers: { cookie: owner }, payload: { type: 'channel', title: '채널', memberIds: [peer.id] } })).json()
    const dm = (await app.inject({ method: 'POST', url: '/api/conversations', headers: { cookie: owner }, payload: { type: 'dm', otherUserId: peer.id } })).json()
    const created = await app.inject({ method: 'POST', url: '/api/agents', headers: { cookie: owner }, payload: { name: '내 Codex', scope: 'CHANNELS' } })
    expect(created.statusCode).toBe(201)
    const agent = created.json()
    const headers = { authorization: `Bearer ${agent.token}` }
    const list = async () => (await app.inject({ url: '/api/agent/conversations', headers })).json().items.map((c: { id: string }) => c.id)
    expect(await list()).toEqual([channel.id])
    expect((await app.inject({ url: `/api/agent/messages?conversationId=${dm.id}`, headers })).statusCode).toBe(403)
    expect((await app.inject({ method: 'PATCH', url: `/api/agents/${agent.id}`, headers: { cookie: owner }, payload: { scope: 'ALL' } })).statusCode).toBe(200)
    expect(await list()).toEqual(expect.arrayContaining([channel.id, dm.id]))
    expect((await app.inject({ method: 'PUT', url: `/api/conversations/${dm.id}/agents/${agent.id}`, headers: { cookie: owner }, payload: { excluded: true } })).statusCode).toBe(200)
    expect(await list()).not.toContain(dm.id)
    expect((await app.inject({ method: 'POST', url: '/api/agent/messages', headers, payload: { conversationId: dm.id, body: '차단되어야 합니다' } })).statusCode).toBe(403)
    await app.inject({ method: 'PATCH', url: `/api/agents/${agent.id}`, headers: { cookie: owner }, payload: { scope: 'CHANNELS' } })
    await app.inject({ method: 'PATCH', url: `/api/agents/${agent.id}`, headers: { cookie: owner }, payload: { scope: 'ALL' } })
    expect(await list()).not.toContain(dm.id)
    await app.inject({ method: 'PUT', url: `/api/conversations/${dm.id}/agents/${agent.id}`, headers: { cookie: owner }, payload: { excluded: false } })
    expect(await list()).toContain(dm.id)
    expect(await testDb.conversationMember.count({ where: { conversationId: dm.id } })).toBe(2)
  } finally { await app.close() }
})

async function setup() {
  const { app, loginAs } = await makeTestApp()
  const owner = await loginAs('a@goldenlabs.dev', 'A')
  const peer = await loginAs('b@goldenlabs.dev', 'Adam Seo')
  const outsider = await loginAs('c@goldenlabs.dev', 'C')
  const a = await testDb.user.findUniqueOrThrow({ where: { email: 'a@goldenlabs.dev' } })
  const b = await testDb.user.findUniqueOrThrow({ where: { email: 'b@goldenlabs.dev' } })
  const dm = (await app.inject({ method: 'POST', url: '/api/conversations', headers: { cookie: owner }, payload: { type: 'dm', otherUserId: b.id } })).json()
  const channel = (await app.inject({ method: 'POST', url: '/api/conversations', headers: { cookie: owner }, payload: { type: 'channel', title: '작업', memberIds: [b.id] } })).json()
  const secret = (await app.inject({ method: 'POST', url: '/api/conversations', headers: { cookie: outsider }, payload: { type: 'channel', title: '비공개', memberIds: [] } })).json()
  const created = await app.inject({ method: 'POST', url: '/api/agents', headers: { cookie: owner }, payload: { name: 'A Codex', scope: 'ALL' } })
  expect(created.statusCode).toBe(201)
  const agent = created.json()
  const headers = { authorization: `Bearer ${agent.token}` }
  return { app, owner, peer, outsider, a, dm, channel, secret, agent, headers }
}

it('새 방·재참여를 현재 멤버십에서 반영하며 제외 설정은 유지하고 타인의 설정 변경을 거부한다', async () => {
  const { app, owner, peer, outsider, a, channel, secret, agent, headers } = await setup()
  try {
    for (const cookie of [peer, outsider]) {
      expect((await app.inject({ method: 'PATCH', url: `/api/agents/${agent.id}`, headers: { cookie }, payload: { scope: 'CHANNELS' } })).statusCode).toBe(404)
      expect((await app.inject({ method: 'DELETE', url: `/api/agents/${agent.id}`, headers: { cookie } })).statusCode).toBe(404)
      expect((await app.inject({ method: 'PUT', url: `/api/conversations/${channel.id}/agents/${agent.id}`, headers: { cookie }, payload: { excluded: true } })).statusCode).toBe(cookie === peer ? 404 : 403)
    }
    const rooms = async () => (await app.inject({ url: '/api/agent/conversations', headers })).json().items.map((c: { id: string }) => c.id)
    expect(await rooms()).not.toContain(secret.id)
    await testDb.conversationMember.create({ data: { conversationId: secret.id, userId: a.id } })
    expect(await rooms()).toContain(secret.id)
    await app.inject({ method: 'PUT', url: `/api/conversations/${secret.id}/agents/${agent.id}`, headers: { cookie: owner }, payload: { excluded: true } })
    await testDb.conversationMember.delete({ where: { conversationId_userId: { conversationId: secret.id, userId: a.id } } })
    await testDb.conversationMember.create({ data: { conversationId: secret.id, userId: a.id } })
    expect(await rooms()).not.toContain(secret.id)
    const newer = await testDb.conversation.create({ data: { type: 'GROUP', title: '새 방', members: { create: { userId: a.id } } } })
    expect(await rooms()).toContain(newer.id)
    await testDb.conversationMember.delete({ where: { conversationId_userId: { conversationId: newer.id, userId: a.id } } })
    expect(await rooms()).not.toContain(newer.id)
    expect((await app.inject({ url: `/api/agent/messages?conversationId=${newer.id}`, headers })).statusCode).toBe(403)
    const otherView = (await app.inject({ url: `/api/conversations/${channel.id}/agents`, headers: { cookie: peer } })).json()
    expect(otherView[0]).toMatchObject({ name: 'A Codex', ownerName: 'A', participating: true, editable: false })
    expect(JSON.stringify(otherView)).not.toContain(agent.token)
  } finally { await app.close() }
})

it('목적지 생략·다른 방의 인용/커서/첨부를 거부하고 DM의 사람 둘과 상대방 이름을 보존한다', async () => {
  const { app, owner, peer, dm, channel, secret, agent, headers } = await setup()
  try {
    const question = (await app.inject({ method: 'POST', url: `/api/conversations/${dm.id}/messages`, headers: { cookie: peer }, payload: { body: '이미지 붙여넣기도 되나요?' } })).json()
    for (const url of ['/api/agent/channel', '/api/agent/messages', `/api/agent/attachments/${randomUUID()}`]) expect((await app.inject({ url, headers })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/api/agent/messages', headers, payload: { body: '목적지 없음' } })).statusCode).toBe(400)
    expect((await app.inject({ url: `/api/agent/channel?conversationId=${secret.id}`, headers })).statusCode).toBe(403)
    expect((await app.inject({ url: `/api/agent/messages?conversationId=${channel.id}&cursor=${question.id}`, headers })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/api/agent/messages', headers, payload: { conversationId: channel.id, body: '다른 방 인용', replyToId: question.id } })).statusCode).toBe(400)
    const file = await testDb.attachment.create({ data: { messageId: question.id, objectKey: 'not-read.txt', fileName: 'private.txt', size: 1, contentType: 'text/plain' } })
    expect((await app.inject({ url: `/api/agent/attachments/${file.id}?conversationId=${channel.id}`, headers })).statusCode).toBe(404)
    const posted = await app.inject({ method: 'POST', url: '/api/agent/messages', headers, payload: { conversationId: dm.id, body: '이미지를 붙여넣고 설명과 함께 보낼 수 있습니다.', replyToId: question.id } })
    expect(posted.statusCode).toBe(201)
    const history = (await app.inject({ url: `/api/conversations/${dm.id}/messages`, headers: { cookie: owner } })).json()
    expect(history.items[0]).toMatchObject({ author: { name: 'A Codex', isAgent: true }, replyTo: { id: question.id } })
    const detail = (await app.inject({ url: `/api/conversations/${dm.id}`, headers: { cookie: owner } })).json()
    expect(detail.displayName).toBe('Adam Seo')
    expect(detail.members).toHaveLength(2)
    const context = await app.inject({ url: `/api/agent/channel?conversationId=${dm.id}`, headers })
    expect(context.json().displayName).toBe('Adam Seo')
    expect(context.body).not.toContain('@goldenlabs.dev')
    await app.inject({ method: 'PATCH', url: `/api/agents/${agent.id}`, headers: { cookie: owner }, payload: { scope: 'CHANNELS' } })
    for (const url of [`/api/agent/channel?conversationId=${dm.id}`, `/api/agent/messages?conversationId=${dm.id}&query=이미지`, `/api/agent/attachments/${file.id}?conversationId=${dm.id}`]) expect((await app.inject({ url, headers })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: '/api/agent/messages', headers, payload: { conversationId: dm.id, body: '축소 후 게시' } })).statusCode).toBe(403)
  } finally { await app.close() }
})

it('기존 채널 키는 범위를 확대하지 않으며 만료·허용목록 변경·전체 회수는 개인 키를 차단한다', async () => {
  const { app, owner, peer, a, dm, channel, agent, headers } = await setup()
  try {
    const legacy = (await app.inject({ method: 'POST', url: `/api/conversations/${channel.id}/agents`, headers: { cookie: owner }, payload: { name: '이전 AI' } })).json()
    const legacyHeaders = { authorization: `Bearer ${legacy.token}` }
    expect((await app.inject({ url: '/api/agent/channel', headers: legacyHeaders })).statusCode).toBe(200)
    expect((await app.inject({ url: `/api/agent/messages?conversationId=${dm.id}`, headers: legacyHeaders })).statusCode).toBe(403)
    expect((await app.inject({ method: 'PATCH', url: `/api/agents/${legacy.id}`, headers: { cookie: owner }, payload: { scope: 'ALL' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'DELETE', url: `/api/conversations/${channel.id}/agents/${legacy.id}`, headers: { cookie: peer } })).statusCode).toBe(404)
    expect((await app.inject({ url: '/api/agent/conversations', headers: legacyHeaders })).json().items.map((c: { id: string }) => c.id)).toEqual([channel.id])
    const persisted = await testDb.agentConnection.findUniqueOrThrow({ where: { id: agent.id } })
    expect(persisted.tokenHash).not.toBe(agent.token)
    await testDb.agentConnection.update({ where: { id: agent.id }, data: { expiresAt: new Date(0) } })
    expect((await app.inject({ url: '/api/agent/conversations', headers })).statusCode).toBe(401)
    await testDb.agentConnection.update({ where: { id: agent.id }, data: { expiresAt: persisted.expiresAt } })
    await testDb.user.update({ where: { id: a.id }, data: { email: 'disabled@example.com' } })
    expect((await app.inject({ url: '/api/agent/conversations', headers })).statusCode).toBe(401)
    await testDb.user.update({ where: { id: a.id }, data: { email: 'a@goldenlabs.dev' } })
    expect((await app.inject({ method: 'DELETE', url: `/api/agents/${agent.id}`, headers: { cookie: owner } })).statusCode).toBe(204)
    expect((await app.inject({ url: '/api/agent/conversations', headers })).statusCode).toBe(401)
    expect((await app.inject({ url: '/api/agent/channel', headers: legacyHeaders })).statusCode).toBe(200)
  } finally { await app.close() }
})
