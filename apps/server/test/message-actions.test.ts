import { beforeEach, describe, expect, it } from 'vitest'
import { MessageDtoSchema, type UserDto } from '@deuce/shared'
import { makeTestApp, type TestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'

interface Ctx extends TestApp {
  aCookie: string
  bCookie: string
  convoId: string
  msgId: string
}

async function setup(): Promise<Ctx> {
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
  const convoId = (convo.json() as { id: string }).id
  const msg = await t.app.inject({
    method: 'POST', url: `/api/conversations/${convoId}/messages`, headers: { cookie: aCookie },
    payload: { body: '원본' },
  })
  return { ...t, aCookie, bCookie, convoId, msgId: (msg.json() as { id: string }).id }
}

describe('message actions', () => {
  beforeEach(resetDb)

  it('edits own message; others get 403', async () => {
    const t = await setup()
    const forbidden = await t.app.inject({
      method: 'PATCH', url: `/api/messages/${t.msgId}`, headers: { cookie: t.bCookie },
      payload: { body: '해킹' },
    })
    expect(forbidden.statusCode).toBe(403)
    const ok = await t.app.inject({
      method: 'PATCH', url: `/api/messages/${t.msgId}`, headers: { cookie: t.aCookie },
      payload: { body: '수정됨' },
    })
    expect(ok.statusCode).toBe(200)
    const dto = MessageDtoSchema.parse(ok.json())
    expect(dto.body).toBe('수정됨')
    expect(dto.editedAt).not.toBeNull()
  })

  it('soft-deletes and masks the body in lists', async () => {
    const t = await setup()
    const del = await t.app.inject({
      method: 'DELETE', url: `/api/messages/${t.msgId}`, headers: { cookie: t.aCookie },
    })
    expect(del.statusCode).toBe(204)
    const list = await t.app.inject({
      method: 'GET', url: `/api/conversations/${t.convoId}/messages`, headers: { cookie: t.aCookie },
    })
    const items = (list.json() as { items: Array<{ deleted: boolean; body: string }> }).items
    expect(items[0]).toMatchObject({ deleted: true, body: '' })
  })

  it('adds and removes reactions idempotently', async () => {
    const t = await setup()
    for (let i = 0; i < 2; i += 1) {
      const res = await t.app.inject({
        method: 'PUT', url: `/api/messages/${t.msgId}/reactions`, headers: { cookie: t.bCookie },
        payload: { emoji: '👍' },
      })
      expect(res.statusCode).toBe(200)
    }
    const list = await t.app.inject({
      method: 'GET', url: `/api/conversations/${t.convoId}/messages`, headers: { cookie: t.aCookie },
    })
    const msg = (list.json() as { items: Array<{ reactions: Array<{ emoji: string; userIds: string[] }> }> }).items[0]!
    expect(msg.reactions).toHaveLength(1)
    expect(msg.reactions[0]!.userIds).toHaveLength(1)

    const remove = await t.app.inject({
      method: 'DELETE',
      url: `/api/messages/${t.msgId}/reactions/${encodeURIComponent('👍')}`,
      headers: { cookie: t.bCookie },
    })
    expect(remove.statusCode).toBe(200)
  })

  it('pins a message and exposes it on conversation detail', async () => {
    const t = await setup()
    const pin = await t.app.inject({
      method: 'PUT', url: `/api/messages/${t.msgId}/pin`, headers: { cookie: t.bCookie },
    })
    expect(pin.statusCode).toBe(200)
    const pinnedDto = MessageDtoSchema.parse(pin.json())
    expect(pinnedDto.pinnedAt).not.toBeNull()
    const detail = await t.app.inject({
      method: 'GET', url: `/api/conversations/${t.convoId}`, headers: { cookie: t.aCookie },
    })
    expect(detail.statusCode).toBe(200)
    const body = detail.json() as { pinnedMessage: { id: string } | null }
    expect(body.pinnedMessage?.id).toBe(t.msgId)

    const unpin = await t.app.inject({
      method: 'DELETE', url: `/api/messages/${t.msgId}/pin`, headers: { cookie: t.aCookie },
    })
    expect(unpin.statusCode).toBe(200)
    const after = await t.app.inject({
      method: 'GET', url: `/api/conversations/${t.convoId}`, headers: { cookie: t.aCookie },
    })
    expect((after.json() as { pinnedMessage: unknown }).pinnedMessage).toBeNull()
  })
})
