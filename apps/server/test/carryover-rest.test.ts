import { beforeEach, describe, expect, it } from 'vitest'
import type { ConversationSummary, UserDto } from '@deuce/shared'
import { makeTestApp, type TestApp } from './api-helpers.js'
import { resetDb, testDb } from './helpers.js'

interface Ctx extends TestApp {
  aCookie: string
  bCookie: string
  groupId: string
  ids: Record<'a' | 'b' | 'c', string>
}

async function setupGroup(): Promise<Ctx> {
  const t = await makeTestApp()
  const aCookie = await t.loginAs('a@goldenlabs.dev', 'A')
  const bCookie = await t.loginAs('b@goldenlabs.dev', 'B')
  await t.loginAs('c@goldenlabs.dev', 'C')
  const users = (
    await t.app.inject({ method: 'GET', url: '/api/users', headers: { cookie: aCookie } })
  ).json() as UserDto[]
  const id = (email: string) => users.find((u) => u.email === email)!.id
  const ids = { a: id('a@goldenlabs.dev'), b: id('b@goldenlabs.dev'), c: id('c@goldenlabs.dev') }
  const convo = await t.app.inject({
    method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
    payload: { type: 'group', title: '이월방', memberIds: [ids.b] },
  })
  return { ...t, aCookie, bCookie, groupId: (convo.json() as { id: string }).id, ids }
}

describe('carryover rest fixes', () => {
  beforeEach(resetDb)

  it('removes another member from a group', async () => {
    const t = await setupGroup()
    const res = await t.app.inject({
      method: 'DELETE', url: `/api/conversations/${t.groupId}/members/${t.ids.b}`,
      headers: { cookie: t.aCookie },
    })
    expect(res.statusCode).toBe(200)
    const dto = res.json() as ConversationSummary
    expect(dto.members.map((m) => m.id)).not.toContain(t.ids.b)

    const bList = await t.app.inject({
      method: 'GET', url: '/api/conversations', headers: { cookie: t.bCookie },
    })
    expect(bList.json()).toEqual([])

    const notMember = await t.app.inject({
      method: 'DELETE', url: `/api/conversations/${t.groupId}/members/${t.ids.c}`,
      headers: { cookie: t.aCookie },
    })
    expect(notMember.statusCode).toBe(404)
  })

  it('rejects removing a member from a dm', async () => {
    const t = await setupGroup()
    const dm = await t.app.inject({
      method: 'POST', url: '/api/conversations', headers: { cookie: t.aCookie },
      payload: { type: 'dm', otherUserId: t.ids.b },
    })
    const dmId = (dm.json() as { id: string }).id
    const res = await t.app.inject({
      method: 'DELETE', url: `/api/conversations/${dmId}/members/${t.ids.b}`,
      headers: { cookie: t.aCookie },
    })
    expect(res.statusCode).toBe(400)
  })

  it('treats read-cursor ties by id like pagination does', async () => {
    const t = await setupGroup()
    const tied = new Date(Date.now() + 60_000)
    const ID1 = '00000000-0000-4000-8000-000000000001'
    const ID2 = '00000000-0000-4000-8000-000000000002'
    await testDb.message.createMany({
      data: [
        { id: ID1, conversationId: t.groupId, authorId: t.ids.b, body: '동시1', createdAt: tied },
        { id: ID2, conversationId: t.groupId, authorId: t.ids.b, body: '동시2', createdAt: tied },
      ],
    })
    const unread = async (): Promise<number> => {
      const list = await t.app.inject({
        method: 'GET', url: '/api/conversations', headers: { cookie: t.aCookie },
      })
      return (list.json() as ConversationSummary[])[0]!.unreadCount
    }
    expect(await unread()).toBe(2)

    const read1 = await t.app.inject({
      method: 'PUT', url: `/api/conversations/${t.groupId}/read`, headers: { cookie: t.aCookie },
      payload: { messageId: ID1 },
    })
    expect(read1.statusCode).toBe(200)
    expect(await unread()).toBe(1) // 같은 createdAt이라도 id가 큰 동시2는 안 읽음

    await t.app.inject({
      method: 'PUT', url: `/api/conversations/${t.groupId}/read`, headers: { cookie: t.aCookie },
      payload: { messageId: ID2 },
    })
    expect(await unread()).toBe(0)

    const rewind = await t.app.inject({
      method: 'PUT', url: `/api/conversations/${t.groupId}/read`, headers: { cookie: t.aCookie },
      payload: { messageId: ID1 },
    })
    expect(rewind.statusCode).toBe(200)
    expect((rewind.json() as { lastReadMessageId: string }).lastReadMessageId).toBe(ID2)
  })

  it('rejects reacting to and pinning a deleted message', async () => {
    const t = await setupGroup()
    const msg = await t.app.inject({
      method: 'POST', url: `/api/conversations/${t.groupId}/messages`,
      headers: { cookie: t.aCookie }, payload: { body: '곧 삭제' },
    })
    const msgId = (msg.json() as { id: string }).id
    await t.app.inject({ method: 'DELETE', url: `/api/messages/${msgId}`, headers: { cookie: t.aCookie } })
    const react = await t.app.inject({
      method: 'PUT', url: `/api/messages/${msgId}/reactions`, headers: { cookie: t.bCookie },
      payload: { emoji: '👍' },
    })
    expect(react.statusCode).toBe(400)
    const pin = await t.app.inject({
      method: 'PUT', url: `/api/messages/${msgId}/pin`, headers: { cookie: t.bCookie },
    })
    expect(pin.statusCode).toBe(400)
  })
})
