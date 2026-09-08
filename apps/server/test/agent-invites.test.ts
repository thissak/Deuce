import { beforeEach, expect, it } from 'vitest'
import { makeTestApp } from './api-helpers.js'
import { resetDb, testDb } from './helpers.js'

beforeEach(resetDb)
it('새 AI는 초대한 방에만 접근하고 중복 초대 알림·사람 멤버십 증가 없이 회수된다', async () => {
  const { app, loginAs } = await makeTestApp()
  try {
    const cookie = await loginAs('a@goldenlabs.dev', 'A'), peerCookie = await loginAs('b@goldenlabs.dev', 'B')
    const peer = await testDb.user.findUniqueOrThrow({ where: { email: 'b@goldenlabs.dev' } })
    const headers = { cookie }
    const dm = (await app.inject({ method: 'POST', url: '/api/conversations', headers, payload: { type: 'dm', otherUserId: peer.id } })).json()
    const channel = (await app.inject({ method: 'POST', url: '/api/conversations', headers, payload: { type: 'channel', title: '다른 방', memberIds: [] } })).json()
    const a = (await app.inject({ method: 'POST', url: '/api/agents', headers, payload: { name: '내 AI' } })).json()
    const token = { authorization: `Bearer ${a.token}` }
    const list = () => app.inject({ url: '/api/agent/conversations', headers: token })
    expect((await list()).json().items).toEqual([])
    expect((await app.inject({ url: '/api/agents', headers })).json()[0]).toMatchObject({ scope: 'SELECTED', isDefault: true, runtime: 'OFFLINE' })
    const invite = () => app.inject({ method: 'PUT', url: `/api/conversations/${dm.id}/agents/${a.id}`, headers, payload: { excluded: false } })
    expect((await Promise.all([invite(), invite()])).map(r => r.statusCode)).toEqual([200, 200])
    expect(await testDb.message.count({ where: { conversationId: dm.id, system: true } })).toBe(1)
    expect(await testDb.conversationMember.count({ where: { conversationId: dm.id } })).toBe(2)
    expect((await list()).json().items.map((r: { id: string }) => r.id)).toEqual([dm.id])
    expect((await app.inject({ url: `/api/conversations/${dm.id}/agents`, headers: { cookie: peerCookie } })).json()[0]).toMatchObject({ participating: true, editable: false })
    for (const url of [`/api/agent/messages?conversationId=${channel.id}`, `/api/agent/messages?conversationId=${channel.id}&query=비밀`, `/api/agent/attachments/unused?conversationId=${channel.id}`])
      expect((await app.inject({ url, headers: token })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: '/api/agent/messages', headers: token, payload: { conversationId: channel.id, body: '안 됨' } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'PUT', url: `/api/conversations/${dm.id}/agents/${a.id}`, headers: { cookie: peerCookie }, payload: { excluded: true } })).statusCode).toBe(404)
    await app.inject({ method: 'PUT', url: `/api/conversations/${dm.id}/agents/${a.id}`, headers, payload: { excluded: true } })
    expect((await list()).json().items).toEqual([])
    expect((await app.inject({ url: '/api/agents', headers })).json()[0].isDefault).toBe(true)
    const system = await testDb.message.findFirstOrThrow({ where: { system: true } })
    expect((await app.inject({ method: 'PATCH', url: `/api/messages/${system.id}`, headers, payload: { body: '위조' } })).statusCode).toBe(403)
  } finally { await app.close() }
})
