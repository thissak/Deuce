import { beforeEach, describe, expect, it } from 'vitest'
import { ConversationSummarySchema, type UserDto } from '@deuce/shared'
import { makeTestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'

async function findUser(app: Awaited<ReturnType<typeof makeTestApp>>['app'], cookie: string, email: string): Promise<UserDto> {
  const res = await app.inject({ method: 'GET', url: '/api/users', headers: { cookie } })
  return (res.json() as UserDto[]).find((u) => u.email === email)!
}

describe('conversations api', () => {
  beforeEach(resetDb)

  it('rejects unauthenticated list', async () => {
    const { app } = await makeTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/conversations' })
    expect(res.statusCode).toBe(401)
  })

  it('creates a dm, dedupes on second create, and lists it', async () => {
    const { app, loginAs } = await makeTestApp()
    const aCookie = await loginAs('a@goldenlabs.dev', 'A')
    await loginAs('b@goldenlabs.dev', 'B')
    const b = await findUser(app, aCookie, 'b@goldenlabs.dev')

    const first = await app.inject({
      method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
      payload: { type: 'dm', otherUserId: b.id },
    })
    expect(first.statusCode).toBe(201)
    const dto = ConversationSummarySchema.parse(first.json())
    expect(dto.type).toBe('DM')
    expect(dto.displayName).toBe('B')
    expect(dto.unreadCount).toBe(0)

    const second = await app.inject({
      method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
      payload: { type: 'dm', otherUserId: b.id },
    })
    expect(second.statusCode).toBe(200)
    expect((second.json() as { id: string }).id).toBe(dto.id)

    const list = await app.inject({ method: 'GET', url: '/api/conversations', headers: { cookie: aCookie } })
    expect(list.statusCode).toBe(200)
    const items = (list.json() as unknown[]).map((x) => ConversationSummarySchema.parse(x))
    expect(items).toHaveLength(1)
  })

  it('creates a group with title as displayName and auto-includes me', async () => {
    const { app, loginAs } = await makeTestApp()
    const aCookie = await loginAs('a@goldenlabs.dev', 'A')
    await loginAs('b@goldenlabs.dev', 'B')
    await loginAs('c@goldenlabs.dev', 'C')
    const b = await findUser(app, aCookie, 'b@goldenlabs.dev')
    const c = await findUser(app, aCookie, 'c@goldenlabs.dev')

    const res = await app.inject({
      method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
      payload: { type: 'group', title: 'FA-50M 훈련 절차 QA', memberIds: [b.id, c.id] },
    })
    expect(res.statusCode).toBe(201)
    const dto = ConversationSummarySchema.parse(res.json())
    expect(dto.type).toBe('GROUP')
    expect(dto.displayName).toBe('FA-50M 훈련 절차 QA')
    expect(dto.members).toHaveLength(3)
  })

  it('rejects dm to self and unknown users', async () => {
    const { app, loginAs } = await makeTestApp()
    const aCookie = await loginAs('a@goldenlabs.dev', 'A')
    const me = await findUser(app, aCookie, 'a@goldenlabs.dev')
    const self = await app.inject({
      method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
      payload: { type: 'dm', otherUserId: me.id },
    })
    expect(self.statusCode).toBe(400)
    const unknown = await app.inject({
      method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
      payload: { type: 'dm', otherUserId: '00000000-0000-0000-0000-000000000000' },
    })
    expect(unknown.statusCode).toBe(404)
  })
})
