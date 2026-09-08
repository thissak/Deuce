import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library'

export interface DesktopCredentials { client_id: string; client_secret: string }

// Google 공식 라이브러리에 PKCE·코드 교환을 맡긴다. OS 브라우저와 loopback 리스너만 연결한다.
export async function desktopLogin(origin: string, openBrowser: (url: string) => Promise<void>, credentials: DesktopCredentials): Promise<string[]> {
  if (!credentials.client_id || !credentials.client_secret) throw new Error('Desktop OAuth configuration missing')
  const client = new OAuth2Client({ clientId: credentials.client_id, clientSecret: credentials.client_secret })
  client.transporter.defaults.timeout = 20_000
  client.transporter.defaults.retry = false
  const codes = await client.generateCodeVerifierAsync()
  const state = randomBytes(32).toString('base64url')
  let resolveCode!: (code: string) => void; let rejectCode!: (error: Error) => void
  const received = new Promise<string>((resolve, reject) => { resolveCode = resolve; rejectCode = reject })
  void received.catch(() => {})
  let consumed = false
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const code = url.searchParams.get('code')
    const denied = url.searchParams.has('error')
    if (req.method !== 'GET' || url.pathname !== '/callback' || url.searchParams.get('state') !== state || consumed || (!denied && (!code || code.length > 4096))) {
      res.writeHead(400); res.end('Invalid login callback'); return
    }
    consumed = true
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'" })
    res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><title>듀스 로그인</title><h1>듀스 앱으로 돌아가세요.</h1><p>이 창은 닫아도 됩니다.</p></html>')
    if (denied) rejectCode(new Error('Login cancelled'))
    else resolveCode(code!)
  })
  const timeout = setTimeout(() => rejectCode(new Error('Login timed out')), 300_000)
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`
    await openBrowser(client.generateAuthUrl({ redirect_uri: redirectUri, scope: ['openid', 'email', 'profile'], state, code_challenge: codes.codeChallenge, code_challenge_method: CodeChallengeMethod.S256 }))
    const code = await received
    const { tokens } = await client.getToken({ code, codeVerifier: codes.codeVerifier, redirect_uri: redirectUri })
    if (!tokens.id_token) throw new Error('Google ID token missing')
    const response = await fetch(new URL('/auth/desktop/session', origin), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: tokens.id_token }) })
    if (!response.ok) throw new Error('Login session failed')
    const cookies = response.headers.getSetCookie()
    if (!cookies.length) throw new Error('Login session missing')
    return cookies
  } finally { clearTimeout(timeout); server.close(); server.closeAllConnections() }
}
