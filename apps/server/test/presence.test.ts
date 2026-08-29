import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Socket as ClientSocket } from 'socket.io-client'
import type { FastifyInstance } from 'fastify'
import { RT, type PresencePayload } from '@deuce/shared'
import { PresenceTracker } from '../src/realtime/presence.js'
import { makeTestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'
import { listen, wsConnect, waitForEvent } from './ws-helpers.js'

describe('PresenceTracker (unit)', () => {
  it('tracks multi-socket users correctly', () => {
    const p = new PresenceTracker()
    expect(p.connect('u1')).toBe('online')   // 첫 접속 → online
    expect(p.connect('u1')).toBeNull()       // 둘째 소켓 → 변화 없음
    expect(p.setAway('u1')).toBe('away')
    expect(p.setAway('u1')).toBeNull()       // 중복 away → 변화 없음
    expect(p.setActive('u1')).toBe('online')
    expect(p.disconnect('u1')).toBeNull()    // 소켓 1개 남음
    expect(p.disconnect('u1')).toBe('offline')
    expect(p.snapshot()).toEqual({})
  })
})

describe('presence integration', () => {
  let app: FastifyInstance | null = null
  const sockets: ClientSocket[] = []

  beforeEach(resetDb)
  afterEach(async () => {
    for (const s of sockets) s.close()
    sockets.length = 0
    if (app) await app.close()
    app = null
  })

  it('broadcasts online, away and offline transitions', async () => {
    const t = await makeTestApp()
    app = t.app
    const aCookie = await t.loginAs('a@goldenlabs.dev', 'A')
    const bCookie = await t.loginAs('b@goldenlabs.dev', 'B')
    const port = await listen(t.app)
    const bSocket = await wsConnect(port, bCookie)
    sockets.push(bSocket)

    const onlineWait = waitForEvent<PresencePayload>(bSocket, RT.presenceChanged)
    const aSocket = await wsConnect(port, aCookie)
    sockets.push(aSocket)
    const online = await onlineWait
    expect(online.status).toBe('online')

    const awayWait = waitForEvent<PresencePayload>(bSocket, RT.presenceChanged)
    aSocket.emit('presence:away')
    expect((await awayWait).status).toBe('away')

    const snap = await t.app.inject({
      method: 'GET', url: '/api/presence', headers: { cookie: bCookie },
    })
    expect(snap.statusCode).toBe(200)
    expect(Object.values(snap.json() as Record<string, string>)).toContain('away')

    const offlineWait = waitForEvent<PresencePayload>(bSocket, RT.presenceChanged)
    aSocket.close()
    expect((await offlineWait).status).toBe('offline')
  })
})
