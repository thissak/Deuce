import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { buildApp, type AppOptions } from '../src/app.js'
import type { GoogleProfile } from '../src/auth/google.js'

export function cookieHeader(res: LightMyRequestResponse): string {
  const raw = res.headers['set-cookie']
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  return list.map((c) => c.split(';')[0]).join('; ')
}

export interface TestApp {
  app: FastifyInstance
  loginAs: (email: string, name?: string) => Promise<string>
}

export async function makeTestApp(overrides: Partial<AppOptions> = {}): Promise<TestApp> {
  let profile: GoogleProfile = { email: 'a@goldenlabs.dev', name: 'A', avatarUrl: null }
  const app = await buildApp({
    exchangeGoogleCode: async () => profile,
    ...overrides,
  })
  async function loginAs(email: string, name = email.split('@')[0]!): Promise<string> {
    profile = { email, name, avatarUrl: null }
    const start = await app.inject({ method: 'GET', url: '/auth/google' })
    const state = new URL(start.headers.location as string).searchParams.get('state')!
    const cb = await app.inject({
      method: 'GET',
      url: `/auth/google/callback?code=fake&state=${state}`,
      headers: { cookie: cookieHeader(start) },
    })
    return cookieHeader(cb)
  }
  return { app, loginAs }
}
