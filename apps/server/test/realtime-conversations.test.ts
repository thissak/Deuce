import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Socket as ClientSocket } from 'socket.io-client'
import type { FastifyInstance } from 'fastify'
import { RT, type ConversationEventPayload, type UserDto } from '@deuce/shared'
import { makeTestApp, type TestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'
import { listen, wsConnect, waitForEvent } from './ws-helpers.js'

describe('realtime conversation events', () => {
  let app: FastifyInstance | null = null
  const sockets: ClientSocket[] = []

  beforeEach(resetDb)
  afterEach(async () => {
    for (const s of sockets) s.close()
    sockets.length = 0
    if (app) await app.close()
    app = null
  })

  it('notifies members on create, rename and removal, syncing rooms', async () => {
    const t = await makeTestApp()
    app = t.app
    const aCookie = await t.loginAs('a@goldenlabs.dev', 'A')
    const bCookie = await t.loginAs('b@goldenlabs.dev', 'B')
    const users = (
      await t.app.inject({ method: 'GET', url: '/api/users', headers: { cookie: aCookie } })
    ).json() as UserDto[]
    const bId = users.find((u) => u.email === 'b@goldenlabs.dev')!.id
    const port = await listen(t.app)
    const bSocket = await wsConnect(port, bCookie)
    sockets.push(bSocket)

    // 생성: b가 conversation.created 수신 + 룸 자동 조인
    const createdWait = waitForEvent<ConversationEventPayload>(bSocket, RT.conversationCreated)
    const convo = await t.app.inject({
      method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
      payload: { type: 'group', title: '실시간방', memberIds: [bId] },
    })
    const convoId = (convo.json() as { id: string }).id
    expect((await createdWait).conversationId).toBe(convoId)
    for (let i = 0; i < 20; i += 1) {
      if ((await t.app.io.in(`convo:${convoId}`).fetchSockets()).length > 0) break
      await new Promise((r) => setTimeout(r, 50))
    }
    expect((await t.app.io.in(`convo:${convoId}`).fetchSockets()).length).toBe(1)

    // 이름 변경: conversation.updated
    const updatedWait = waitForEvent<ConversationEventPayload>(bSocket, RT.conversationUpdated)
    await t.app.inject({
      method: 'PATCH', url: `/api/conversations/${convoId}`, headers: { cookie: aCookie },
      payload: { title: '바뀐 이름' },
    })
    expect((await updatedWait).conversationId).toBe(convoId)

    // 타인 제거: b가 conversation.removed 수신 + 룸 이탈
    const removedWait = waitForEvent<ConversationEventPayload>(bSocket, RT.conversationRemoved)
    await t.app.inject({
      method: 'DELETE', url: `/api/conversations/${convoId}/members/${bId}`,
      headers: { cookie: aCookie },
    })
    expect((await removedWait).conversationId).toBe(convoId)
    for (let i = 0; i < 20; i += 1) {
      if ((await t.app.io.in(`convo:${convoId}`).fetchSockets()).length === 0) break
      await new Promise((r) => setTimeout(r, 50))
    }
    expect((await t.app.io.in(`convo:${convoId}`).fetchSockets()).length).toBe(0)
  })
})
