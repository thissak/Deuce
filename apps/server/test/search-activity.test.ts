import { beforeEach, describe, expect, it } from 'vitest'
import { ActivityItemSchema, SearchResultSchema, type UserDto } from '@deuce/shared'
import { makeTestApp, type TestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'

interface Ctx extends TestApp {
  aCookie: string
  bCookie: string
  convoId: string
  aId: string
}

async function setup(): Promise<Ctx> {
  const t = await makeTestApp()
  const aCookie = await t.loginAs('a@goldenlabs.dev', 'A')
  const bCookie = await t.loginAs('b@goldenlabs.dev', 'B')
  const users = (
    await t.app.inject({ method: 'GET', url: '/api/users', headers: { cookie: aCookie } })
  ).json() as UserDto[]
  const a = users.find((u) => u.email === 'a@goldenlabs.dev')!
  const b = users.find((u) => u.email === 'b@goldenlabs.dev')!
  const convo = await t.app.inject({
    method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
    payload: { type: 'dm', otherUserId: b.id },
  })
  return { ...t, aCookie, bCookie, convoId: (convo.json() as { id: string }).id, aId: a.id }
}

describe('search & activity', () => {
  beforeEach(resetDb)

  it('finds korean substrings only in my conversations', async () => {
    const t = await setup()
    await t.app.inject({
      method: 'POST', url: `/api/conversations/${t.convoId}/messages`, headers: { cookie: t.aCookie },
      payload: { body: '훈련 절차 정리했습니다' },
    })
    const hit = await t.app.inject({
      method: 'GET', url: `/api/search?q=${encodeURIComponent('절차')}`, headers: { cookie: t.aCookie },
    })
    expect(hit.statusCode).toBe(200)
    const results = (hit.json() as unknown[]).map((x) => SearchResultSchema.parse(x))
    expect(results).toHaveLength(1)
    expect(results[0]!.body).toContain('절차')

    // 대화방 밖 사용자에게는 보이지 않는다
    const cCookie = await t.loginAs('c@goldenlabs.dev', 'C')
    const miss = await t.app.inject({
      method: 'GET', url: `/api/search?q=${encodeURIComponent('절차')}`, headers: { cookie: cCookie },
    })
    expect(miss.json()).toEqual([])

    const tooShort = await t.app.inject({
      method: 'GET', url: '/api/search?q=절', headers: { cookie: t.aCookie },
    })
    expect(tooShort.statusCode).toBe(400)
  })

  it('escapes ILIKE wildcards in the query', async () => {
    const t = await setup()
    await t.app.inject({
      method: 'POST', url: `/api/conversations/${t.convoId}/messages`, headers: { cookie: t.aCookie },
      payload: { body: '100% 완료' },
    })
    const literal = await t.app.inject({
      method: 'GET', url: `/api/search?q=${encodeURIComponent('0%')}`, headers: { cookie: t.aCookie },
    })
    expect((literal.json() as unknown[]).length).toBe(1)
    const wildcardAbuse = await t.app.inject({
      method: 'GET', url: `/api/search?q=${encodeURIComponent('%완')}`, headers: { cookie: t.aCookie },
    })
    expect((wildcardAbuse.json() as unknown[]).length).toBe(0)
  })

  it('lists mentions of me and reactions on my messages', async () => {
    const t = await setup()
    const mine = await t.app.inject({
      method: 'POST', url: `/api/conversations/${t.convoId}/messages`, headers: { cookie: t.aCookie },
      payload: { body: '내 메시지' },
    })
    const myMsgId = (mine.json() as { id: string }).id
    await t.app.inject({
      method: 'POST', url: `/api/conversations/${t.convoId}/messages`, headers: { cookie: t.bCookie },
      payload: { body: '@A 확인 부탁', mentions: [t.aId] },
    })
    await t.app.inject({
      method: 'PUT', url: `/api/messages/${myMsgId}/reactions`, headers: { cookie: t.bCookie },
      payload: { emoji: '👍' },
    })
    const res = await t.app.inject({
      method: 'GET', url: '/api/activity', headers: { cookie: t.aCookie },
    })
    expect(res.statusCode).toBe(200)
    const items = (res.json() as unknown[]).map((x) => ActivityItemSchema.parse(x))
    expect(items).toHaveLength(2)
    const kinds = items.map((i) => i.kind).sort()
    expect(kinds).toEqual(['mention', 'reaction'])
    for (const item of items) expect(item.actor.email).toBe('b@goldenlabs.dev')
  })

  it('drops activity from a conversation I have since left', async () => {
    const t = await setup()
    const users = (
      await t.app.inject({ method: 'GET', url: '/api/users', headers: { cookie: t.aCookie } })
    ).json() as { id: string; email: string }[]
    const bId = users.find((u) => u.email === 'b@goldenlabs.dev')!.id
    const group = await t.app.inject({
      method: 'POST', url: '/api/conversations', headers: { cookie: t.aCookie },
      payload: { type: 'group', title: '그룹', memberIds: [bId] },
    })
    const groupId = (group.json() as { id: string }).id
    await t.app.inject({
      method: 'POST', url: `/api/conversations/${groupId}/messages`, headers: { cookie: t.bCookie },
      payload: { body: '@A 확인 부탁', mentions: [t.aId] },
    })
    const before = await t.app.inject({
      method: 'GET', url: '/api/activity', headers: { cookie: t.aCookie },
    })
    expect((before.json() as unknown[]).map((x) => ActivityItemSchema.parse(x))).toHaveLength(1)

    const leave = await t.app.inject({
      method: 'DELETE', url: `/api/conversations/${groupId}/members/me`, headers: { cookie: t.aCookie },
    })
    expect(leave.statusCode).toBe(204)

    const after = await t.app.inject({
      method: 'GET', url: '/api/activity', headers: { cookie: t.aCookie },
    })
    expect(after.json()).toEqual([])
  })
})
