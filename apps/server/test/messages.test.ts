import { beforeEach, describe, expect, it } from 'vitest'
import { MessageDtoSchema, type UserDto } from '@deuce/shared'
import { makeTestApp, type TestApp } from './api-helpers.js'
import { resetDb, testDb } from './helpers.js'

interface Ctx extends TestApp {
  aCookie: string
  bCookie: string
  convoId: string
}

async function setupDm(): Promise<Ctx> {
  const t = await makeTestApp()
  const aCookie = await t.loginAs('a@goldenlabs.dev', 'A')
  const bCookie = await t.loginAs('b@goldenlabs.dev', 'B')
  const users = (
    await t.app.inject({ method: 'GET', url: '/api/users', headers: { cookie: aCookie } })
  ).json() as UserDto[]
  const b = users.find((u) => u.email === 'b@goldenlabs.dev')!
  const convo = await t.app.inject({
    method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
    payload: { type: 'dm', otherUserId: b.id },
  })
  return { ...t, aCookie, bCookie, convoId: (convo.json() as { id: string }).id }
}

describe('messages api', () => {
  beforeEach(resetDb)

  it('posts a message and a quote reply with mention', async () => {
    const { app, aCookie, bCookie, convoId } = await setupDm()
    const users = (
      await app.inject({ method: 'GET', url: '/api/users', headers: { cookie: aCookie } })
    ).json() as UserDto[]
    const a = users.find((u) => u.email === 'a@goldenlabs.dev')!

    const first = await app.inject({
      method: 'POST', url: `/api/conversations/${convoId}/messages`, headers: { cookie: aCookie },
      payload: { body: '안녕하세요' },
    })
    expect(first.statusCode).toBe(201)
    const msg = MessageDtoSchema.parse(first.json())

    const reply = await app.inject({
      method: 'POST', url: `/api/conversations/${convoId}/messages`, headers: { cookie: bCookie },
      payload: { body: '@A 답장입니다', replyToId: msg.id, mentions: [a.id] },
    })
    expect(reply.statusCode).toBe(201)
    const dto = MessageDtoSchema.parse(reply.json())
    expect(dto.replyTo?.id).toBe(msg.id)
    expect(dto.replyTo?.authorName).toBe('A')
    expect(dto.mentions).toEqual([a.id])
  })

  it('rejects non-member, bad replyTo, and non-member mention', async () => {
    const { app, convoId, loginAs, aCookie } = await setupDm()
    const cCookie = await loginAs('c@goldenlabs.dev', 'C')
    const outsider = await app.inject({
      method: 'POST', url: `/api/conversations/${convoId}/messages`, headers: { cookie: cCookie },
      payload: { body: '침입' },
    })
    expect(outsider.statusCode).toBe(403)

    const badReply = await app.inject({
      method: 'POST', url: `/api/conversations/${convoId}/messages`, headers: { cookie: aCookie },
      payload: { body: 'x', replyToId: '00000000-0000-0000-0000-000000000000' },
    })
    expect(badReply.statusCode).toBe(400)

    const users = (
      await app.inject({ method: 'GET', url: '/api/users', headers: { cookie: aCookie } })
    ).json() as UserDto[]
    const c = users.find((u) => u.email === 'c@goldenlabs.dev')!
    const badMention = await app.inject({
      method: 'POST', url: `/api/conversations/${convoId}/messages`, headers: { cookie: aCookie },
      payload: { body: 'x', mentions: [c.id] },
    })
    expect(badMention.statusCode).toBe(400)
  })

  it('paginates messages newest-first with cursor', async () => {
    const { app, aCookie, convoId } = await setupDm()
    for (const body of ['하나', '둘', '셋']) {
      const res = await app.inject({
        method: 'POST', url: `/api/conversations/${convoId}/messages`, headers: { cookie: aCookie },
        payload: { body },
      })
      expect(res.statusCode).toBe(201)
    }
    const page1 = await app.inject({
      method: 'GET', url: `/api/conversations/${convoId}/messages?limit=2`, headers: { cookie: aCookie },
    })
    const p1 = page1.json() as { items: Array<{ body: string; id: string }>; nextCursor: string | null }
    expect(p1.items.map((m) => m.body)).toEqual(['셋', '둘'])
    expect(p1.nextCursor).toBe(p1.items[1]!.id)

    const page2 = await app.inject({
      method: 'GET',
      url: `/api/conversations/${convoId}/messages?limit=2&cursor=${p1.nextCursor}`,
      headers: { cookie: aCookie },
    })
    const p2 = page2.json() as { items: Array<{ body: string }>; nextCursor: string | null }
    expect(p2.items.map((m) => m.body)).toEqual(['하나'])
    expect(p2.nextCursor).toBeNull()
  })

  it('paginates without skipping or duplicating when createdAt ties', async () => {
    const { app, aCookie, convoId } = await setupDm()
    const users = (
      await app.inject({ method: 'GET', url: '/api/users', headers: { cookie: aCookie } })
    ).json() as UserDto[]
    const a = users.find((u) => u.email === 'a@goldenlabs.dev')!
    const sameTime = new Date('2026-08-29T00:00:00.000Z')
    await testDb.message.createMany({
      data: ['하나', '둘', '셋'].map((body) => ({
        conversationId: convoId,
        authorId: a.id,
        body,
        createdAt: sameTime,
      })),
    })

    const page1 = await app.inject({
      method: 'GET', url: `/api/conversations/${convoId}/messages?limit=2`, headers: { cookie: aCookie },
    })
    const p1 = page1.json() as { items: Array<{ id: string }>; nextCursor: string | null }
    expect(p1.items).toHaveLength(2)

    const page2 = await app.inject({
      method: 'GET',
      url: `/api/conversations/${convoId}/messages?limit=2&cursor=${p1.nextCursor}`,
      headers: { cookie: aCookie },
    })
    const p2 = page2.json() as { items: Array<{ id: string }>; nextCursor: string | null }

    const allIds = [...p1.items.map((m) => m.id), ...p2.items.map((m) => m.id)]
    expect(new Set(allIds).size).toBe(3)
    expect(allIds).toHaveLength(3)
    expect(p2.nextCursor).toBeNull()
  })
})
