import { beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { loadConfig } from '../src/config.js'
import { makeTestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'

function addProbe(app: FastifyInstance): void {
  app.get('/api/_probe', { preHandler: app.authenticate }, async (req) => ({
    email: req.currentUser.email,
  }))
  app.get('/api/_boom', { preHandler: app.authenticate }, async () => {
    throw new Error('비밀 내부 정보')
  })
}

describe('authenticate guard & error handler', () => {
  beforeEach(resetDb)

  it('returns 401 without a session', async () => {
    const { app } = await makeTestApp()
    addProbe(app)
    const res = await app.inject({ method: 'GET', url: '/api/_probe' })
    expect(res.statusCode).toBe(401)
  })

  it('sets currentUser for a logged-in allowed user', async () => {
    const { app, loginAs } = await makeTestApp()
    addProbe(app)
    const cookie = await loginAs('a@goldenlabs.dev', 'A')
    const res = await app.inject({ method: 'GET', url: '/api/_probe', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ email: 'a@goldenlabs.dev' })
  })

  it('rejects a session whose email left the allowlist', async () => {
    const first = await makeTestApp()
    addProbe(first.app)
    const cookie = await first.loginAs('a@goldenlabs.dev', 'A')
    const second = await makeTestApp({
      config: { ...loadConfig(), allowedEmails: ['b@goldenlabs.dev'] },
    })
    addProbe(second.app)
    const res = await second.app.inject({ method: 'GET', url: '/api/_probe', headers: { cookie } })
    expect(res.statusCode).toBe(401)
  })

  it('masks internal errors as 500 internal error', async () => {
    const { app, loginAs } = await makeTestApp()
    addProbe(app)
    const cookie = await loginAs('a@goldenlabs.dev', 'A')
    const res = await app.inject({ method: 'GET', url: '/api/_boom', headers: { cookie } })
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ error: 'internal error' })
    expect(res.payload).not.toContain('비밀')
  })
})
