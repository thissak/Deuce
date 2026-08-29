import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Socket as ClientSocket } from 'socket.io-client'
import type { FastifyInstance } from 'fastify'
import { RT, type MessageDto, type ReadAdvancedPayload, type UserDto } from '@deuce/shared'
import { makeTestApp, type TestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'
import { listen, wsConnect, waitForEvent } from './ws-helpers.js'

interface Ctx extends TestApp {
  aCookie: string
  bCookie: string
  convoId: string
  port: number
  bSocket: ClientSocket
}

describe('realtime message events', () => {
  let app: FastifyInstance | null = null
  const sockets: ClientSocket[] = []

  beforeEach(resetDb)
  afterEach(async () => {
    for (const s of sockets) s.close()
    sockets.length = 0
    if (app) await app.close()
    app = null
  })

  async function setup(): Promise<Ctx> {
    const t = await makeTestApp()
    app = t.app
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
    const port = await listen(t.app)
    const bSocket = await wsConnect(port, bCookie)
    sockets.push(bSocket)
    // b의 룸 조인 완료 대기
    for (let i = 0; i < 20; i += 1) {
      if ((await t.app.io.in(`convo:${convoId}`).fetchSockets()).length > 0) break
      await new Promise((r) => setTimeout(r, 50))
    }
    return { ...t, aCookie, bCookie, convoId, port, bSocket }
  }

  it('broadcasts message.new on post', async () => {
    const c = await setup()
    const waiting = waitForEvent<MessageDto>(c.bSocket, RT.messageNew)
    const posted = await c.app.inject({
      method: 'POST', url: `/api/conversations/${c.convoId}/messages`,
      headers: { cookie: c.aCookie }, payload: { body: '실시간 안녕' },
    })
    const dto = await waiting
    expect(dto.id).toBe((posted.json() as { id: string }).id)
    expect(dto.body).toBe('실시간 안녕')
  })

  it('broadcasts reaction.changed, message.updated(pin) and masked message.deleted', async () => {
    const c = await setup()
    const posted = await c.app.inject({
      method: 'POST', url: `/api/conversations/${c.convoId}/messages`,
      headers: { cookie: c.aCookie }, payload: { body: '대상' },
    })
    const msgId = (posted.json() as { id: string }).id

    const reactWait = waitForEvent<MessageDto>(c.bSocket, RT.reactionChanged)
    await c.app.inject({
      method: 'PUT', url: `/api/messages/${msgId}/reactions`,
      headers: { cookie: c.aCookie }, payload: { emoji: '👍' },
    })
    expect((await reactWait).reactions[0]!.emoji).toBe('👍')

    const pinWait = waitForEvent<MessageDto>(c.bSocket, RT.messageUpdated)
    await c.app.inject({
      method: 'PUT', url: `/api/messages/${msgId}/pin`, headers: { cookie: c.aCookie },
    })
    expect((await pinWait).pinnedAt).not.toBeNull()

    const delWait = waitForEvent<MessageDto>(c.bSocket, RT.messageDeleted)
    await c.app.inject({
      method: 'DELETE', url: `/api/messages/${msgId}`, headers: { cookie: c.aCookie },
    })
    const deleted = await delWait
    expect(deleted).toMatchObject({ id: msgId, deleted: true, body: '' })
  })

  it('broadcasts read.advanced', async () => {
    const c = await setup()
    const posted = await c.app.inject({
      method: 'POST', url: `/api/conversations/${c.convoId}/messages`,
      headers: { cookie: c.bCookie }, payload: { body: '읽어줘' },
    })
    const msgId = (posted.json() as { id: string }).id
    const waiting = waitForEvent<ReadAdvancedPayload>(c.bSocket, RT.readAdvanced)
    await c.app.inject({
      method: 'PUT', url: `/api/conversations/${c.convoId}/read`,
      headers: { cookie: c.aCookie }, payload: { messageId: msgId },
    })
    const payload = await waiting
    expect(payload).toMatchObject({ conversationId: c.convoId, lastReadMessageId: msgId })
  })
})
