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
    expect(read2.statusCode).toBe(204)
    expect((await mySummary(t, t.aCookie)).unreadCount).toBe(0)

    const rewind = await t.app.inject({
      method: 'PUT', url: `/api/conversations/${t.groupId}/read`, headers: { cookie: t.aCookie },
      payload: { messageId: m1.id },
    })
    expect(rewind.statusCode).toBe(204)
    expect((await mySummary(t, t.aCookie)).unreadCount).toBe(0)
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
