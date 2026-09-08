import { afterEach, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHash } from 'node:crypto'
import { OAuth2Client } from 'google-auth-library'
import { desktopLogin } from '../src/login'
import { trustedUrl, externalUrl } from '../src/security'

const credentials = { client_id: 'desktop-test', client_secret: 'native-client-value' }
afterEach(() => vi.restoreAllMocks())
it('Google 기본 브라우저 URL·PKCE·코드 교환·세션 발급을 연결하고 리스너를 닫는다', async () => {
  let challenge = ''; let callbackUrl = ''; let redirectUri = ''
  const exchange = vi.spyOn(OAuth2Client.prototype, 'getToken').mockImplementation(async (options: any) => {
    expect(options.code).toBe('4/Google-format-code')
    expect(createHash('sha256').update(options.codeVerifier).digest('base64url')).toBe(challenge)
    expect(options.redirect_uri).toBe(redirectUri)
    return { tokens: { id_token: 'verified-by-server' }, res: null } as any
  })
  const api = createServer(async (req, res) => {
    expect(req.url).toBe('/auth/desktop/session')
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c)
    expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual({ idToken: 'verified-by-server' })
    res.writeHead(200, { 'set-cookie': 'session=test; HttpOnly; Secure; Path=/' }); res.end('{"ok":true}')
  })
  await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve))
  try {
    const cookies = await desktopLogin(`http://127.0.0.1:${(api.address() as AddressInfo).port}`, async (start) => {
      const u = new URL(start); challenge = u.searchParams.get('code_challenge')!
      expect(u.origin).toBe('https://accounts.google.com')
      expect(u.searchParams.get('code_challenge_method')).toBe('S256')
      expect(u.searchParams.get('client_id')).toBe(credentials.client_id)
      expect(u.searchParams.get('scope')).toBe('openid email profile')
      expect(u.searchParams.has('client_secret')).toBe(false)
      redirectUri = u.searchParams.get('redirect_uri')!
      const callback = new URL(redirectUri); callback.searchParams.set('code', '4/Google-format-code'); callback.searchParams.set('state', u.searchParams.get('state')!)
      callbackUrl = callback.toString()
      expect((await fetch(callbackUrl.replace('state=', 'badstate='))).status).toBe(400)
      expect((await fetch(callbackUrl)).status).toBe(200)
      expect((await fetch(callbackUrl)).status).toBe(400)
    }, credentials)
    expect(cookies[0]).toContain('session=test')
    expect(exchange).toHaveBeenCalledTimes(1)
    await expect(fetch(callbackUrl)).rejects.toThrow()
  } finally { api.close(); api.closeAllConnections() }
})
it('Google 동의 취소는 즉시 종료하고 토큰 교환을 하지 않는다', async () => {
  const exchange = vi.spyOn(OAuth2Client.prototype, 'getToken')
  let callbackUrl = ''
  await expect(desktopLogin('https://deuce.goldenlabs.dev', async (start) => {
    const u = new URL(start); const cb = new URL(u.searchParams.get('redirect_uri')!)
    cb.searchParams.set('state', u.searchParams.get('state')!); cb.searchParams.set('error', 'access_denied')
    callbackUrl = cb.toString(); await fetch(callbackUrl)
  }, credentials)).rejects.toThrow('Login cancelled')
  expect(exchange).not.toHaveBeenCalled()
  await expect(fetch(callbackUrl)).rejects.toThrow()
})
it('앱의 신뢰 경계에서 유사 도메인·자격 증명 URL·로컬 실행 프로토콜을 차단한다', () => {
  expect(trustedUrl('https://deuce.goldenlabs.dev/chat')).toBe(true)
  for (const u of ['https://deuce.goldenlabs.dev.evil.com', 'http://deuce.goldenlabs.dev', 'https://u:p@deuce.goldenlabs.dev', 'file:///etc/passwd']) expect(trustedUrl(u)).toBe(false)
  for (const u of ['file:///bin/sh','javascript:alert(1)','deuce://login','https://u:p@example.com']) expect(externalUrl(u)).toBe(false)
  expect(externalUrl('https://example.com')).toBe(true)
})
