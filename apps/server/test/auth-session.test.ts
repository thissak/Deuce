import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

describe('session auth', () => {
  it('returns 401 from /auth/me without a session', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/auth/me' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 204 from /auth/logout', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/auth/logout' })
    expect(res.statusCode).toBe(204)
  })
})
