import { beforeEach, describe, expect, it } from 'vitest'
import type { LightMyRequestResponse } from 'fastify'
import { UserDtoSchema } from '@deuce/shared'
import { buildApp } from '../src/app.js'
import { resetDb } from './helpers.js'

function cookieHeader(res: LightMyRequestResponse): string {
  const raw = res.headers['set-cookie']
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  return list.map((c) => c.split(';')[0]).join('; ')
}

async function completeLogin(app: Awaited<ReturnType<typeof buildApp>>) {
  const start = await app.inject({ method: 'GET', url: '/auth/google' })
  expect(start.statusCode).toBe(302)
  const state = new URL(start.headers.location as string).searchParams.get('state')!
  return app.inject({
    method: 'GET',
    url: `/auth/google/callback?code=fake-code&state=${state}`,
    headers: { cookie: cookieHeader(start) },
  })
}

describe('google login', () => {
  beforeEach(resetDb)

  it('logs in an allowed user and serves /auth/me', async () => {
    const app = await buildApp({
      exchangeGoogleCode: async () => ({
        email: 'a@goldenlabs.dev',
        name: '테스터',
        avatarUrl: null,
      }),
    })
    const cb = await completeLogin(app)
    expect(cb.statusCode).toBe(302)
    expect(cb.headers.location).toBe('/')

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(cb) },
    })
    expect(me.statusCode).toBe(200)
    const dto = UserDtoSchema.parse(me.json())
    expect(dto.email).toBe('a@goldenlabs.dev')
    expect(dto.name).toBe('테스터')
  })

  it('rejects an email outside the allowlist with 403', async () => {
    const app = await buildApp({
      exchangeGoogleCode: async () => ({
        email: 'outsider@gmail.com',
        name: 'X',
        avatarUrl: null,
      }),
    })
    const cb = await completeLogin(app)
    expect(cb.statusCode).toBe(403)
  })

  it('rejects a mismatched oauth state with 400', async () => {
    const app = await buildApp({
      exchangeGoogleCode: async () => ({
        email: 'a@goldenlabs.dev',
        name: 'A',
        avatarUrl: null,
      }),
    })
    const start = await app.inject({ method: 'GET', url: '/auth/google' })
    const res = await app.inject({
      method: 'GET',
      url: '/auth/google/callback?code=fake&state=wrong',
      headers: { cookie: cookieHeader(start) },
    })
    expect(res.statusCode).toBe(400)
  })
})
