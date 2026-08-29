import { beforeEach, describe, expect, it } from 'vitest'
import type { LightMyRequestResponse } from 'fastify'
import { UserDtoSchema } from '@deuce/shared'
import { buildApp } from '../src/app.js'
import { resetDb, testDb } from './helpers.js'

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

  it('returns 401 without leaking internal error details when the code exchange fails', async () => {
    const app = await buildApp({
      exchangeGoogleCode: async () => {
        throw new Error('invalid_grant: 상세한 내부 디버깅 정보')
      },
    })
    const cb = await completeLogin(app)
    expect(cb.statusCode).toBe(401)
    const body = cb.json()
    expect(body).toEqual({ error: 'login failed' })
    expect(JSON.stringify(body)).not.toContain('invalid_grant')
  })

  it('rejects a replayed callback state after a successful login with 400', async () => {
    const app = await buildApp({
      exchangeGoogleCode: async () => ({
        email: 'a@goldenlabs.dev',
        name: '테스터',
        avatarUrl: null,
      }),
    })
    const start = await app.inject({ method: 'GET', url: '/auth/google' })
    const state = new URL(start.headers.location as string).searchParams.get('state')!
    const first = await app.inject({
      method: 'GET',
      url: `/auth/google/callback?code=fake-code&state=${state}`,
      headers: { cookie: cookieHeader(start) },
    })
    expect(first.statusCode).toBe(302)

    // 실제 브라우저처럼 첫 콜백이 갱신한 쿠키를 이어서 사용해 재생을 시도한다
    const replay = await app.inject({
      method: 'GET',
      url: `/auth/google/callback?code=fake-code&state=${state}`,
      headers: { cookie: cookieHeader(first) },
    })
    expect(replay.statusCode).toBe(400)
  })

  it('sets HttpOnly and SameSite=Lax on the session cookie', async () => {
    const app = await buildApp({
      exchangeGoogleCode: async () => ({
        email: 'a@goldenlabs.dev',
        name: '테스터',
        avatarUrl: null,
      }),
    })
    const cb = await completeLogin(app)
    const raw = cb.headers['set-cookie']
    const cookies = Array.isArray(raw) ? raw : raw ? [raw] : []
    expect(cookies.length).toBeGreaterThan(0)
    for (const cookie of cookies) {
      expect(cookie).toMatch(/HttpOnly/i)
      expect(cookie).toMatch(/SameSite=Lax/i)
      expect(cookie).toMatch(/Max-Age=1209600/i)
    }
  })

  it('clears the session cookie on logout and locks out a browser using the cleared cookie', async () => {
    const app = await buildApp({
      exchangeGoogleCode: async () => ({
        email: 'a@goldenlabs.dev',
        name: '테스터',
        avatarUrl: null,
      }),
    })
    const cb = await completeLogin(app)
    const loginCookie = cookieHeader(cb)

    const meBefore = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: loginCookie } })
    expect(meBefore.statusCode).toBe(200)

    const logout = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie: loginCookie } })
    expect(logout.statusCode).toBe(204)
    const rawSetCookie = logout.headers['set-cookie']
    const setCookies = Array.isArray(rawSetCookie) ? rawSetCookie : rawSetCookie ? [rawSetCookie] : []
    expect(setCookies.length).toBeGreaterThan(0)
    expect(setCookies[0]).toMatch(/Max-Age=0/i)

    // 실제 브라우저처럼 로그아웃 응답이 갱신한 쿠키를 그대로 이어서 사용한다
    const meAfter = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(logout) },
    })
    expect(meAfter.statusCode).toBe(401)
  })

  it('returns 401 for a session whose user was deleted', async () => {
    const app = await buildApp({
      exchangeGoogleCode: async () => ({
        email: 'a@goldenlabs.dev',
        name: '테스터',
        avatarUrl: null,
      }),
    })
    const cb = await completeLogin(app)
    const cookie = cookieHeader(cb)

    await testDb.user.deleteMany({ where: { email: 'a@goldenlabs.dev' } })

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } })
    expect(me.statusCode).toBe(401)
  })
})
