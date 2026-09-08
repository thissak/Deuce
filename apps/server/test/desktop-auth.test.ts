import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import { OAuth2Client } from 'google-auth-library'
import { CertificateFormat } from 'google-auth-library/build/src/auth/oauth2client.js'
import { makeTestApp, cookieHeader } from './api-helpers.js'
import { resetDb, testDb } from './helpers.js'
import { loadConfig } from '../src/config.js'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const desktopClientId = 'desktop-test.apps.googleusercontent.com'
const config = () => ({ ...loadConfig(), google: { ...loadConfig().google, desktopClientId } })
function token(overrides = {}) {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: desktopClientId, sub: 'google:a@goldenlabs.dev', iat: now, exp: now + 3600, email: 'a@goldenlabs.dev', email_verified: true, name: 'A', ...overrides })).toString('base64url')
  const signed = `${header}.${payload}`
  return `${signed}.${sign('RSA-SHA256', Buffer.from(signed), privateKey).toString('base64url')}`
}
beforeEach(async () => {
  await resetDb()
  // 네트워크 인증서 조회만 대체한다. verifyIdToken의 실제 서명·aud/iss/exp 검증을 실행한다.
  vi.spyOn(OAuth2Client.prototype, 'getFederatedSignonCertsAsync').mockResolvedValue({ certs: { test: publicKey.export({ type: 'spki', format: 'pem' }).toString() }, format: CertificateFormat.PEM })
})
afterEach(() => vi.restoreAllMocks())

it('공식 ID 토큰 검증 후 기존 웹 계정·세션을 재사용한다', async () => {
  const { app, loginAs } = await makeTestApp({ config: config() })
  try {
    const web = await loginAs('a@goldenlabs.dev')
    const webMe = await app.inject({ url: '/auth/me', headers: { cookie: web } })
    const res = await app.inject({ method: 'POST', url: '/auth/desktop/session', payload: { idToken: token() } })
    expect(res.statusCode).toBe(200)
    const me = await app.inject({ url: '/auth/me', headers: { cookie: cookieHeader(res) } })
    expect(me.json().id).toBe(webMe.json().id)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(await testDb.user.count()).toBe(1)
    expect((await app.inject('/auth/desktop/start')).statusCode).toBe(404)
    expect((await app.inject('/auth/desktop/confirm')).statusCode).toBe(404)
  } finally { await app.close() }
})

it('잘못된 서명·다른 클라이언트·발급자·만료·미인증 이메일을 거부한다', async () => {
  const { app } = await makeTestApp({ config: config() })
  try {
    const valid = token(); const [header, payload] = valid.split('.')
    for (const idToken of [token({ aud: 'web-client' }), token({ iss: 'https://evil.example' }), token({ exp: 1 }), token({ email_verified: false }), token({ sub: '' }), `${header}.${payload}.${Buffer.alloc(256).toString('base64url')}`]) {
      const r = await app.inject({ method: 'POST', url: '/auth/desktop/session', payload: { idToken } })
      expect(r.statusCode).toBe(401)
      expect(r.headers['set-cookie']).toBeUndefined()
      expect(r.body).toBe('{"error":"login failed"}')
    }
    expect(await testDb.user.count()).toBe(0)
  } finally { await app.close() }
})

it('허용목록·외부 Origin·본문 제한과 미설정 상태를 적용한다', async () => {
  const { app } = await makeTestApp({ config: config() })
  try {
    const post = (payload: Record<string, string>, headers = {}) => app.inject({ method: 'POST', url: '/auth/desktop/session', payload, headers })
    expect((await post({ idToken: token({ email: 'outsider@example.com' }) })).statusCode).toBe(403)
    expect((await post({ idToken: token() }, { origin: 'null' })).statusCode).toBe(403)
    expect((await post({ idToken: token() }, { origin: 'https://evil.example' })).statusCode).toBe(403)
    expect((await post({ code: 'old', verifier: 'old' })).statusCode).toBe(400)
    expect((await post({ idToken: 'a'.repeat(17000) })).statusCode).toBe(413)
  } finally { await app.close() }
  const disabled = await makeTestApp()
  try { expect((await disabled.app.inject({ method: 'POST', url: '/auth/desktop/session', payload: { idToken: token() } })).statusCode).toBe(503) }
  finally { await disabled.app.close() }
})

it('기존 계정에 sub를 연결하고 다른 sub가 계정을 덮어쓰지 못한다', async () => {
  const existing = await testDb.user.create({ data: { email: 'a@goldenlabs.dev', name: 'Existing' } })
  const { app } = await makeTestApp({ config: config() })
  try {
    const post = (idToken: string) => app.inject({ method: 'POST', url: '/auth/desktop/session', payload: { idToken } })
    expect((await post(token())).statusCode).toBe(200)
    expect((await testDb.user.findUniqueOrThrow({ where: { id: existing.id } })).googleSub).toBe('google:a@goldenlabs.dev')
    expect((await post(token({ sub: 'someone-else' }))).statusCode).toBe(401)
    expect((await post(token({ email: 'b@goldenlabs.dev' }))).statusCode).toBe(200)
    expect((await testDb.user.findUniqueOrThrow({ where: { id: existing.id } })).email).toBe('b@goldenlabs.dev')
    expect(await testDb.user.count()).toBe(1)
  } finally { await app.close() }
})
