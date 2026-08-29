import { beforeEach, describe, expect, it } from 'vitest'
import type { UserDto, ConversationSummary } from '@deuce/shared'
import { makeTestApp, type TestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'

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
    payload: { type: 'group', title: '테스트방', memberIds: [ids.b] },
  })
  return { ...t, aCookie, bCookie, groupId: (convo.json() as { id: string }).id, ids }
}

async function mySummary(t: Ctx, cookie: string): Promise<ConversationSummary> {
  const list = await t.app.inject({ method: 'GET', url: '/api/conversations', headers: { cookie } })
  return (list.json() as ConversationSummary[])[0]!
}

describe('conversation admin & read cursor', () => {
  beforeEach(resetDb)

  it('renames a group, adds a member, and lets a member leave', async () => {
    const t = await setupGroup()
    const rename = await t.app.inject({
      method: 'PATCH', url: `/api/conversations/${t.groupId}`, headers: { cookie: t.aCookie },
      payload: { title: '새 이름' },
    })
    expect(rename.statusCode).toBe(200)
    expect((rename.json() as ConversationSummary).displayName).toBe('새 이름')

    const add = await t.app.inject({
      method: 'POST', url: `/api/conversations/${t.groupId}/members`, headers: { cookie: t.aCookie },
      payload: { userIds: [t.ids.c] },
    })
    expect(add.statusCode).toBe(200)
    expect((add.json() as ConversationSummary).members).toHaveLength(3)

    const leave = await t.app.inject({
      method: 'DELETE', url: `/api/conversations/${t.groupId}/members/me`, headers: { cookie: t.bCookie },
    })
    expect(leave.statusCode).toBe(204)
    const afterLeave = await t.app.inject({
      method: 'GET', url: '/api/conversations', headers: { cookie: t.bCookie },
    })
    expect(afterLeave.json()).toEqual([])
  })

  it('mutes and unmutes', async () => {
    const t = await setupGroup()
    const mute = await t.app.inject({
      method: 'PUT', url: `/api/conversations/${t.groupId}/mute`, headers: { cookie: t.aCookie },
    })
    expect(mute.statusCode).toBe(204)
    expect((await mySummary(t, t.aCookie)).mutedAt).not.toBeNull()
    const unmute = await t.app.inject({
      method: 'DELETE', url: `/api/conversations/${t.groupId}/mute`, headers: { cookie: t.aCookie },
    })
    expect(unmute.statusCode).toBe(204)
    expect((await mySummary(t, t.aCookie)).mutedAt).toBeNull()
  })

  it('advances the read cursor and never rewinds it', async () => {
    const t = await setupGroup()
    const send = async (body: string) =>
      (
        await t.app.inject({
          method: 'POST', url: `/api/conversations/${t.groupId}/messages`,
          headers: { cookie: t.bCookie }, payload: { body },
        })
      ).json() as { id: string }
    const m1 = await send('하나')
    const m2 = await send('둘')

    expect((await mySummary(t, t.aCookie)).unreadCount).toBe(2)

    const read2 = await t.app.inject({
      method: 'PUT', url: `/api/conversations/${t.groupId}/read`, headers: { cookie: t.aCookie },
      payload: { messageId: m2.id },
    })
    expect(read2.statusCode).toBe(200)
    expect(read2.json()).toEqual({ conversationId: t.groupId, lastReadMessageId: m2.id })
    expect((await mySummary(t, t.aCookie)).unreadCount).toBe(0)

    const rewind = await t.app.inject({
      method: 'PUT', url: `/api/conversations/${t.groupId}/read`, headers: { cookie: t.aCookie },
      payload: { messageId: m1.id },
    })
    expect(rewind.statusCode).toBe(200)
    expect((rewind.json() as { lastReadMessageId: string }).lastReadMessageId).toBe(m2.id)
    expect((await mySummary(t, t.aCookie)).unreadCount).toBe(0)
  })

  it('rejects leaving a dm', async () => {
    const t = await setupGroup()
    const dm = await t.app.inject({
      method: 'POST', url: '/api/conversations', headers: { cookie: t.aCookie },
      payload: { type: 'dm', otherUserId: t.ids.b },
    })
    const dmId = (dm.json() as { id: string }).id
    const leave = await t.app.inject({
      method: 'DELETE', url: `/api/conversations/${dmId}/members/me`, headers: { cookie: t.aCookie },
    })
    expect(leave.statusCode).toBe(400)
    expect(leave.json()).toEqual({ error: 'group only' })
  })

  it('counts unread only from messages sent after a member joins', async () => {
    const t = await setupGroup()
    const send = async (body: string) =>
      (
        await t.app.inject({
          method: 'POST', url: `/api/conversations/${t.groupId}/messages`,
          headers: { cookie: t.bCookie }, payload: { body },
        })
      ).json() as { id: string }
    await send('가입 전 메시지 1')
    await send('가입 전 메시지 2')

    const cCookie = await t.loginAs('c@goldenlabs.dev', 'C')
    const add = await t.app.inject({
      method: 'POST', url: `/api/conversations/${t.groupId}/members`, headers: { cookie: t.aCookie },
      payload: { userIds: [t.ids.c] },
    })
    expect(add.statusCode).toBe(200)

    expect((await mySummary(t, cCookie)).unreadCount).toBe(0)

    await send('가입 후 메시지')
    expect((await mySummary(t, cCookie)).unreadCount).toBe(1)
  })

  it('orders the conversation list by most recent message', async () => {
    const t = await makeTestApp()
    const aCookie = await t.loginAs('a@goldenlabs.dev', 'A')
    const bCookie = await t.loginAs('b@goldenlabs.dev', 'B')
    const cCookie = await t.loginAs('c@goldenlabs.dev', 'C')
    const users = (
      await t.app.inject({ method: 'GET', url: '/api/users', headers: { cookie: aCookie } })
    ).json() as UserDto[]
    const id = (email: string) => users.find((u) => u.email === email)!.id

    const convo1 = (
      await t.app.inject({
        method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
        payload: { type: 'dm', otherUserId: id('b@goldenlabs.dev') },
      })
    ).json() as { id: string }
    const convo2 = (
      await t.app.inject({
        method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
        payload: { type: 'dm', otherUserId: id('c@goldenlabs.dev') },
      })
    ).json() as { id: string }

    await t.app.inject({
      method: 'POST', url: `/api/conversations/${convo1.id}/messages`,
      headers: { cookie: bCookie }, payload: { body: '먼저' },
    })
    await t.app.inject({
      method: 'POST', url: `/api/conversations/${convo2.id}/messages`,
      headers: { cookie: cCookie }, payload: { body: '나중' },
    })

    const list1 = (
      await t.app.inject({ method: 'GET', url: '/api/conversations', headers: { cookie: aCookie } })
    ).json() as ConversationSummary[]
    expect(list1.map((c) => c.id)).toEqual([convo2.id, convo1.id])

    await t.app.inject({
      method: 'POST', url: `/api/conversations/${convo1.id}/messages`,
      headers: { cookie: bCookie }, payload: { body: '또 먼저 방에' },
    })
    const list2 = (
      await t.app.inject({ method: 'GET', url: '/api/conversations', headers: { cookie: aCookie } })
    ).json() as ConversationSummary[]
    expect(list2.map((c) => c.id)).toEqual([convo1.id, convo2.id])
  })

  it('rejects rename of a dm and by a non-member', async () => {
    const t = await setupGroup()
    const cCookie = await t.loginAs('c@goldenlabs.dev', 'C')
    const byOutsider = await t.app.inject({
      method: 'PATCH', url: `/api/conversations/${t.groupId}`, headers: { cookie: cCookie },
      payload: { title: 'x' },
    })
    expect(byOutsider.statusCode).toBe(403)

    const dm = await t.app.inject({
      method: 'POST', url: '/api/conversations', headers: { cookie: t.aCookie },
      payload: { type: 'dm', otherUserId: t.ids.b },
    })
    const dmId = (dm.json() as { id: string }).id
    const renameDm = await t.app.inject({
      method: 'PATCH', url: `/api/conversations/${dmId}`, headers: { cookie: t.aCookie },
      payload: { title: 'x' },
    })
    expect(renameDm.statusCode).toBe(400)
  })
})
