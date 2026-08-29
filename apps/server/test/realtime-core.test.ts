import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Socket as ClientSocket } from 'socket.io-client'
import type { FastifyInstance } from 'fastify'
import type { UserDto } from '@deuce/shared'
import { makeTestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'
import { listen, wsConnect } from './ws-helpers.js'

describe('realtime core', () => {
  let app: FastifyInstance | null = null
  const sockets: ClientSocket[] = []

  beforeEach(resetDb)
  afterEach(async () => {
    for (const s of sockets) s.close()
    sockets.length = 0
    if (app) await app.close()
    app = null
  })

  it('rejects a connection without a valid session', async () => {
    const t = await makeTestApp()
    app = t.app
    const port = await listen(t.app)
    await expect(wsConnect(port, 'session=garbage')).rejects.toThrow()
  })

  it('accepts a logged-in user and joins conversation rooms', async () => {
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
    const socket = await wsConnect(port, aCookie)
    sockets.push(socket)

    // 접속 직후 룸 조인은 비동기 — 짧게 재시도하며 확인
    let joined = 0
    for (let i = 0; i < 20 && joined === 0; i += 1) {
      joined = (await t.app.io.in(`convo:${convoId}`).fetchSockets()).length
      if (joined === 0) await new Promise((r) => setTimeout(r, 50))
    }
    expect(joined).toBe(1)
    const aId = users.find((u) => u.email === 'a@goldenlabs.dev')!.id
    expect((await t.app.io.in(`user:${aId}`).fetchSockets()).length).toBe(1)
  })
})
