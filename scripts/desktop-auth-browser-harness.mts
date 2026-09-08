// Isolated test DB + real Chromium loopback navigation + actual desktop login function.
// Google code exchange is simulated; actual Google signature validation is covered by server tests.
import '../apps/server/test/setup.js'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
process.env.NODE_ENV = 'test'
const require = createRequire(resolve('apps/desktop/package.json'))
const { OAuth2Client } = require('google-auth-library')
const { desktopLogin } = await import('../apps/desktop/src/login.js')
const { makeTestApp } = await import('../apps/server/test/api-helpers.js')
const { loadConfig } = await import('../apps/server/src/config.js')
const config = loadConfig(); config.google.desktopClientId = 'harness-desktop'
const { app } = await makeTestApp({ config, verifyDesktopToken: async (idToken) => {
  if (idToken !== 'harness-token') throw new Error('Unexpected token')
  return { sub: 'google:a@goldenlabs.dev', email: 'a@goldenlabs.dev', name: 'A', avatarUrl: null }
} })
OAuth2Client.prototype.getToken = async () => ({ tokens: { id_token: 'harness-token' } })
try {
  await app.listen({ port: 0, host: '127.0.0.1' })
  const origin = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  const cookies = await desktopLogin(origin, async (start) => {
    const google = new URL(start)
    if (google.origin !== 'https://accounts.google.com') throw new Error('Unexpected auth origin')
    const callback = new URL(google.searchParams.get('redirect_uri')!)
    callback.searchParams.set('state', google.searchParams.get('state')!); callback.searchParams.set('code', '4/harness')
    const executable = resolve('apps/desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
    const child = spawn(executable, [resolve('scripts/desktop-auth-browser-client.cjs')], { stdio: ['pipe', 'inherit', 'inherit'] })
    child.stdin.end(JSON.stringify({ callback: callback.toString() }))
    const status = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
    if (status !== 0) throw new Error('Browser callback failed')
  }, { client_id: 'harness-desktop', client_secret: 'native-test' })
  const me = await app.inject({ url: '/auth/me', headers: { cookie: cookies.map(c => c.split(';')[0]).join('; ') } })
  if (me.statusCode !== 200 || me.json().email !== 'a@goldenlabs.dev') throw new Error('App session missing')
  console.log(JSON.stringify({ browserCallback: 'passed', desktopSession: 'passed', googleExchange: 'simulated' }))
} finally { await app.close(); const { prisma } = await import('../apps/server/src/db.js'); await prisma.$disconnect() }
