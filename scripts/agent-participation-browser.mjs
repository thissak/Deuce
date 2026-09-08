// Run with the workspace tsx loader and DEUCE_PLAYWRIGHT_MODULE pointing to an installed playwright package.
// Uses only the dedicated localhost deuce_issue8_browser_test DB; never a developer or production DB.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

Object.assign(process.env, {
  DATABASE_URL: 'postgresql://deuce:deuce@localhost:5434/deuce_issue8_browser_test',
  SESSION_KEY_HEX: 'a'.repeat(64), GOOGLE_CLIENT_ID: 'test', GOOGLE_CLIENT_SECRET: 'test',
  GOOGLE_CALLBACK_URL: 'http://localhost:4000/auth/google/callback',
  ALLOWED_EMAILS: 'a@goldenlabs.dev,b@goldenlabs.dev,c@goldenlabs.dev',
  UPLOAD_DIR: '/tmp/deuce-agent-participation/browser-uploads', NODE_ENV: 'test',
})
const root = resolve(import.meta.dirname, '..')
const require = createRequire(new URL('../apps/mcp/package.json', import.meta.url))
const { chromium } = await import(pathToFileURL(resolve(process.env.DEUCE_PLAYWRIGHT_MODULE, 'index.mjs')).href)
const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href)
const { StreamableHTTPClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js')).href)
const { makeTestApp } = await import('../apps/server/test/api-helpers.ts')
const { resetDb, testDb } = await import('../apps/server/test/helpers.ts')
const { prisma } = await import('../apps/server/src/db.ts')
const { serveWeb } = await import('../apps/server/src/web.ts')
await resetDb()
const artifacts = '/tmp/deuce-agent-participation/browser'
await mkdir(artifacts, { recursive: true })
const { app, loginAs } = await makeTestApp()
await serveWeb(app, resolve(root, 'apps/web/dist'))
const ownerCookie = await loginAs('a@goldenlabs.dev', '테스트 감독')
const peerCookie = await loginAs('b@goldenlabs.dev', 'Adam Seo')
const peerUser = await testDb.user.findUniqueOrThrow({ where: { email: 'b@goldenlabs.dev' } })
const dm = (await app.inject({ method: 'POST', url: '/api/conversations', headers: { cookie: ownerCookie }, payload: { type: 'dm', otherUserId: peerUser.id } })).json()
await app.inject({ method: 'POST', url: '/api/conversations', headers: { cookie: ownerCookie }, payload: { type: 'channel', title: '테스트 채널', memberIds: [peerUser.id] } })
const question = (await app.inject({ method: 'POST', url: `/api/conversations/${dm.id}/messages`, headers: { cookie: peerCookie }, payload: { body: '이미지는 어떻게 보내나요?' } })).json()
const origin = await app.listen({ host: '127.0.0.1', port: 0 })
const browser = await chromium.launch({ headless: true })
const client = new Client({ name: 'browser-mcp-check', version: '1' })
let page
let clipboardSaved = false
const errors = []
const unpack = (r) => { assert.notEqual(r.isError, true); return JSON.parse(r.content[0].text) }
const cookies = (value) => value.split('; ').map((part) => {
  const split = part.indexOf('='); return { name: part.slice(0, split), value: part.slice(split + 1), url: origin }
})
try {
  const owner = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const peer = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await owner.addCookies(cookies(ownerCookie)); await peer.addCookies(cookies(peerCookie))
  page = await owner.newPage(); const peerPage = await peer.newPage()
  page.on('pageerror', (e) => errors.push(e.message)); peerPage.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${origin}/chat/${dm.id}`); await peerPage.goto(`${origin}/chat/${dm.id}`)
  await page.getByRole('button', { name: 'AI 연결', exact: true }).waitFor()
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await page.getByLabel('AI 이름', { exact: true }).fill('테스트 Codex')
  const created = page.waitForResponse((r) => r.url() === `${origin}/api/agents` && r.request().method() === 'POST')
  await page.getByRole('button', { name: '에이전트 등록', exact: true }).click()
  const key = await (await created).json()
  assert.equal(typeof key.token, 'string')
  await page.getByRole('button', { name: 'Codex 설정 복사' }).waitFor()
  assert.ok(!(await page.locator('body').innerText()).includes(key.token))
  await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { requestInit: { headers: { authorization: `Bearer ${key.token}` } } }))
  assert.ok(unpack(await client.callTool({ name: 'list_conversations', arguments: {} })).items.every((c) => c.type === 'CHANNEL'))
  await page.getByRole('button', { name: '연결 설정을 저장했습니다' }).click()
  await page.getByRole('button', { name: '닫기', exact: true }).click()
  await page.getByRole('button', { name: 'AI 연결', exact: true }).click()
  await page.getByText(/채널만 참여하도록 설정되어 있습니다/).waitFor()
  await page.getByRole('button', { name: '내 에이전트 설정', exact: true }).click()
  const scopeChanged = page.waitForResponse((r) => r.url() === `${origin}/api/agents/${key.id}` && r.request().method() === 'PATCH')
  await page.getByRole('combobox', { name: '테스트 Codex 참여 범위' }).selectOption('ALL')
  await scopeChanged
  await page.screenshot({ path: `${artifacts}/agent-settings.png` })
  await page.getByRole('button', { name: '닫기', exact: true }).click()
  await page.getByRole('button', { name: '이 대화에서 해제' }).waitFor()
  await peerPage.getByRole('button', { name: 'AI 연결', exact: true }).click()
  await peerPage.getByText('테스트 Codex', { exact: true }).waitFor()
  assert.equal(await peerPage.getByRole('button', { name: '이 대화에서 해제' }).count(), 0)
  const rooms = unpack(await client.callTool({ name: 'list_conversations', arguments: {} })).items
  assert.ok(rooms.some((c) => c.id === dm.id && c.displayName === 'Adam Seo'))
  const context = unpack(await client.callTool({ name: 'get_conversation', arguments: { conversationId: dm.id } }))
  assert.ok(context.members.some((m) => m.isAgent && m.name === '테스트 Codex'))
  unpack(await client.callTool({ name: 'post_message', arguments: { conversationId: dm.id, body: '입력창에 이미지를 붙여넣고 설명과 함께 보내세요.', replyToId: question.id } }))
  await page.getByRole('button', { name: '이 대화에서 해제' }).click()
  await page.getByRole('button', { name: '참여시키기' }).waitFor()
  await peerPage.getByText('참여 중인 에이전트가 없습니다.', { exact: false }).waitFor()
  assert.equal((await client.callTool({ name: 'read_messages', arguments: { conversationId: dm.id } })).isError, true)
  await page.getByRole('button', { name: '참여시키기' }).click()
  await page.getByRole('button', { name: '이 대화에서 해제' }).waitFor()
  await page.screenshot({ path: `${artifacts}/dm-agents.png` })
  await page.getByRole('button', { name: '닫기', exact: true }).click()
  await peerPage.getByRole('button', { name: '닫기', exact: true }).click()

  // Preserve the user's clipboard inside this browser context; clipboard contents are never logged.
  await page.evaluate(async () => {
    globalThis.__deuceClipboardBefore = await Promise.all((await navigator.clipboard.read()).filter((item) => item.types.length > 0).map(async (item) =>
      new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async (type) => [type, await item.getType(type)]))))))
  })
  clipboardSaved = true
  async function pasteImage(caption = '') {
    await page.evaluate(async (caption) => {
      const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 240
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#5b5fc7'; ctx.fillRect(0, 0, 480, 240)
      ctx.fillStyle = 'white'; ctx.font = '24px sans-serif'; ctx.fillText('Deuce clipboard image test', 40, 120)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob, ...(caption ? { 'text/plain': new Blob([caption], { type: 'text/plain' }) } : {}) })])
    }, caption)
    await page.getByPlaceholder('메시지를 입력하세요').focus()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V')
    await page.locator('.file-chip-preview').waitFor()
  }
  await pasteImage('함께 복사한 설명')
  assert.equal(await page.getByPlaceholder('메시지를 입력하세요').inputValue(), '함께 복사한 설명')
  await page.screenshot({ path: `${artifacts}/clipboard-preview.png` })
  await page.getByRole('button', { name: '첨부 제거' }).click()
  assert.equal(await page.locator('.file-chip-preview').count(), 0)
  await pasteImage()
  await page.getByPlaceholder('메시지를 입력하세요').fill('클립보드 이미지 설명')
  const uploaded = page.waitForResponse((r) => r.url().endsWith(`/conversations/${dm.id}/attachments`) && r.request().method() === 'POST')
  await page.getByRole('button', { name: '보내기', exact: true }).click()
  const message = await (await uploaded).json()
  assert.equal(message.body, '클립보드 이미지 설명'); assert.equal(message.attachments.length, 1)
  const peerMessage = peerPage.locator(`#msg-${message.id}`)
  await peerMessage.waitFor()
  assert.ok((await peerMessage.innerText()).includes('클립보드 이미지 설명'))
  const image = await client.callTool({ name: 'read_attachment', arguments: { conversationId: dm.id, attachmentId: message.attachments[0].id } })
  assert.equal(image.content[0].type, 'image')

  let failOnce = true
  await page.route(`**/api/conversations/${dm.id}/attachments`, async (route) => {
    if (failOnce) { failOnce = false; await route.fulfill({ status: 500, json: { error: 'test upload failure' } }) }
    else await route.continue()
  })
  await pasteImage(); await page.getByPlaceholder('메시지를 입력하세요').fill('실패 재전송 이미지')
  await page.getByRole('button', { name: '보내기', exact: true }).click()
  await page.getByRole('button', { name: '재전송', exact: true }).waitFor()
  await pasteImage(); await page.getByPlaceholder('메시지를 입력하세요').fill('보존할 다음 초안')
  const retried = page.waitForResponse((r) => r.url().endsWith(`/conversations/${dm.id}/attachments`) && r.status() === 201)
  await page.getByRole('button', { name: '재전송', exact: true }).click()
  const retryMessage = await (await retried).json()
  await peerPage.locator(`#msg-${retryMessage.id}`).waitFor()
  assert.equal(retryMessage.body, '실패 재전송 이미지')
  assert.equal(await page.getByPlaceholder('메시지를 입력하세요').inputValue(), '보존할 다음 초안')
  assert.equal(await page.locator('.file-chip-preview').count(), 1)
  await page.screenshot({ path: `${artifacts}/clipboard-retry.png` })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ result: 'PASS', checks: ['DM AI controls', 'scope CHANNELS to ALL', 'peer visibility and read-only controls', 'MCP discovery and quoted reply', 'disconnect and reconnect', 'native clipboard keyboard paste', 'mixed text and image', 'preview removal', 'real upload and MCP image read', 'failed upload retry and preserved draft'], artifacts }))
} finally {
  if (clipboardSaved) await page.evaluate(async () => {
    const saved = globalThis.__deuceClipboardBefore
    if (saved.length) await navigator.clipboard.write(saved)
    else await navigator.clipboard.writeText('')
    delete globalThis.__deuceClipboardBefore
  }).catch(() => {})
  await client.close(); await browser.close(); await app.close(); await testDb.$disconnect(); await prisma.$disconnect()
}
