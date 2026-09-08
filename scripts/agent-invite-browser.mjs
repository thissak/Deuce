// Fixture-only browser regression. Never reads production conversations or credentials.
// DEUCE_LIVE_AI=codex|claude opts into the installed CLI's login and real model usage.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
Object.assign(process.env, {
  DATABASE_URL: 'postgresql://deuce:deuce@localhost:5434/deuce_issue8_browser_test',
  SESSION_KEY_HEX: 'a'.repeat(64), GOOGLE_CLIENT_ID: 'test', GOOGLE_CLIENT_SECRET: 'test',
  GOOGLE_CALLBACK_URL: 'http://localhost:4000/auth/google/callback',
  ALLOWED_EMAILS: 'a@goldenlabs.dev,b@goldenlabs.dev,c@goldenlabs.dev',
  UPLOAD_DIR: '/tmp/deuce-ai-invite/browser-uploads', NODE_ENV: 'test',
})
const root = resolve(import.meta.dirname, '..')
const { chromium } = await import(pathToFileURL(resolve(process.env.DEUCE_PLAYWRIGHT_MODULE, 'index.mjs')).href)
const { makeTestApp } = await import('../apps/server/test/api-helpers.ts')
const { resetDb, testDb } = await import('../apps/server/test/helpers.ts')
const { prisma } = await import('../apps/server/src/db.ts')
const { serveWeb } = await import('../apps/server/src/web.ts')
const { connectRunner, checkProvider } = await import('../packages/agent-runner/src/index.ts')
await resetDb()
const artifacts = resolve(root, '.private/ai-invite-implementation')
await mkdir(artifacts, { recursive: true })
const { app, loginAs } = await makeTestApp()
await serveWeb(app, resolve(root, 'apps/web/dist'))
const ownerCookie = await loginAs('a@goldenlabs.dev', '테스트 감독'), peerCookie = await loginAs('b@goldenlabs.dev', '테스트 동료')
const peerUser = await testDb.user.findUniqueOrThrow({ where: { email: 'b@goldenlabs.dev' } })
const dm = (await app.inject({ method: 'POST', url: '/api/conversations', headers: { cookie: ownerCookie }, payload: { type: 'dm', otherUserId: peerUser.id } })).json()
const secretRoom = (await app.inject({ method: 'POST', url: '/api/conversations', headers: { cookie: ownerCookie }, payload: { type: 'channel', title: '초대하지 않은 방', memberIds: [] } })).json()
await app.inject({ method: 'POST', url: `/api/conversations/${secretRoom.id}/messages`, headers: { cookie: ownerCookie }, payload: { body: 'UNINVITED-ROOM-SECRET' } })
await app.inject({ method: 'POST', url: `/api/conversations/${dm.id}/messages`, headers: { cookie: peerCookie }, payload: { body: '검증용 프로젝트명은 DEUCE-READY입니다.' } })
const origin = await app.listen({ host: '127.0.0.1', port: 0 })
const browser = await chromium.launch({ headless: true })
const provider = process.env.DEUCE_LIVE_AI ?? 'codex'
assert.ok(['codex', 'claude'].includes(provider))
const errors = []; let runner; let agentId; let connectionCalls = 0
const cookies = value => value.split('; ').map(part => { const split = part.indexOf('='); return { name: part.slice(0, split), value: part.slice(split + 1), url: origin } })
try {
  const owner = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const peer = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await owner.addCookies(cookies(ownerCookie)); await peer.addCookies(cookies(peerCookie))
  // Narrow preload API simulated here; the real desktop controller has separate ownership/encryption tests.
  await owner.exposeFunction('__connectFixtureAgent', async key => {
    connectionCalls++; agentId = key.agentId
    if (process.env.DEUCE_LIVE_AI) await checkProvider(provider)
    runner = connectRunner({ baseUrl: origin, token: key.token, provider,
      ...(process.env.DEUCE_LIVE_AI ? {} : { execute: async (_, task) => {
        assert.equal(task.conversationId, dm.id)
        assert.ok(!JSON.stringify(task).includes('UNINVITED-ROOM-SECRET'))
        assert.ok(JSON.stringify(task.context).includes('INVITE-FILE-READY'))
        return 'DEUCE-READY · INVITE-FILE-READY'
      } }),
    })
    const identity = await runner.start(); assert.equal(identity.agentId, agentId)
    return { ok: true, persisted: true }
  })
  await owner.addInitScript(() => { window.deuceDesktop = { focus: () => {}, connectAgent: key => window.__connectFixtureAgent(key) } })
  const page = await owner.newPage(), peerPage = await peer.newPage()
  page.on('pageerror', e => errors.push(e.message)); peerPage.on('pageerror', e => errors.push(e.message))
  await page.goto(`${origin}/chat/${dm.id}`); await peerPage.goto(`${origin}/chat/${dm.id}`)
  await page.getByTestId('file-input').setInputFiles({ name: '요구사항.txt', mimeType: 'text/plain', buffer: Buffer.from('자료 확인 코드는 INVITE-FILE-READY입니다.') })
  const upload = page.waitForResponse(r => r.url().endsWith(`/conversations/${dm.id}/attachments`) && r.status() === 201)
  await page.getByRole('button', { name: '보내기', exact: true }).click(); await upload
  await page.getByPlaceholder('메시지를 입력하세요').fill('초대 후에도 남길 초안')
  await page.getByRole('button', { name: 'AI 초대', exact: true }).click()
  await page.getByLabel('AI 이름', { exact: true }).fill('테스트 AI')
  assert.equal(await page.getByRole('radio', { name: '초대한 방만 참여', exact: true }).isChecked(), true)
  await page.getByRole('button', { name: '에이전트 등록', exact: true }).click()
  await page.getByRole('button', { name: '이 PC에서 연결', exact: true }).click()
  await page.getByRole('button', { name: '내 AI 참여 중', exact: true }).waitFor({ timeout: 25_000 })
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.equal(await page.getByPlaceholder('메시지를 입력하세요').inputValue(), '초대 후에도 남길 초안')
  await peerPage.locator('.agent-participants').getByText(/테스트 AI.*응답 가능/).waitFor()
  assert.equal(await testDb.conversationMember.count({ where: { conversationId: dm.id } }), 2)
  await peerPage.getByRole('button', { name: 'AI 관리', exact: true }).click()
  assert.equal(await peerPage.getByRole('button', { name: '이 대화에서 해제' }).count(), 0)
  await peerPage.getByRole('button', { name: '닫기', exact: true }).click()

  await peerPage.getByRole('button', { name: 'AI에게 요청', exact: true }).click()
  await peerPage.getByLabel('요청 내용', { exact: true }).fill('대화의 검증용 프로젝트명과 첨부 자료의 확인 코드를 알려주세요. 두 코드만 짧게 답하세요.')
  const requested = peerPage.waitForResponse(r => r.url().endsWith(`/agents/${agentId}/requests`) && r.status() === 202)
  await peerPage.getByRole('button', { name: '요청 보내기', exact: true }).click()
  const receipt = await (await requested).json()
  await peerPage.getByText('AI가 대화에 답했습니다.', { exact: true }).waitFor({ timeout: 180_000 })
  const completed = await testDb.agentRun.findUniqueOrThrow({ where: { id: receipt.id } })
  assert.equal(completed.status, 'COMPLETED')
  const answer = await testDb.message.findUniqueOrThrow({ where: { id: completed.resultMessageId }, include: { author: true } })
  assert.equal(answer.author.isAgent, true); assert.ok(answer.body.includes('DEUCE-READY')); assert.ok(answer.body.includes('INVITE-FILE-READY'))
  assert.ok(!answer.body.includes('UNINVITED-ROOM-SECRET'))
  await page.locator(`#msg-${answer.id}`).waitFor(); await peerPage.getByRole('button', { name: '닫기', exact: true }).click()
  await peerPage.locator(`#msg-${answer.id}`).waitFor()

  // Reuse the saved AI: removal and a single invite click never repeat setup.
  await page.getByRole('button', { name: '내 AI 참여 중', exact: true }).click()
  await page.getByRole('button', { name: '이 대화에서 해제', exact: true }).click()
  await page.getByRole('button', { name: '참여시키기', exact: true }).waitFor()
  await page.getByRole('button', { name: '닫기', exact: true }).click()
  await page.getByRole('button', { name: 'AI 초대', exact: true }).click()
  await page.getByRole('button', { name: '내 AI 참여 중', exact: true }).waitFor()
  assert.equal(connectionCalls, 1); assert.equal(await page.getByRole('dialog').count(), 0)
  assert.equal(await page.getByPlaceholder('메시지를 입력하세요').inputValue(), '초대 후에도 남길 초안')

  // Exercise the actual Composer wiring as well as the request dialog.
  await page.getByPlaceholder('메시지를 입력하세요').fill('@테스트')
  await page.locator('.mention-pop').getByRole('button', { name: '테스트 AI', exact: false }).click()
  await page.getByPlaceholder('메시지를 입력하세요').fill('@테스트 AI 프로젝트명과 자료 확인 코드만 다시 알려주세요.')
  const mentioned = page.waitForResponse(r => r.url().endsWith(`/conversations/${dm.id}/messages`) && r.status() === 201)
  await page.getByRole('button', { name: '보내기', exact: true }).click()
  const mention = await (await mentioned).json()
  await page.locator('.msg-author').filter({ hasText: '테스트 AI' }).nth(1).waitFor({ timeout: 180_000 })
  const second = await testDb.agentRun.findUniqueOrThrow({ where: { id: mention.id } })
  await page.locator(`#msg-${second.resultMessageId}`).waitFor()
  await page.screenshot({ path: `${artifacts}/desktop.png` })
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(await page.locator('.list-panel').isVisible(), false)
    assert.ok(await page.getByRole('button', { name: '내 AI 참여 중', exact: true }).isVisible())
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: `${artifacts}/mobile-${width}.png` })
  }
  await page.getByRole('link', { name: '대화 목록으로 돌아가기', exact: true }).click()
  await page.locator('.list-panel').waitFor({ state: 'visible' })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ result: 'PASS', provider: process.env.DEUCE_LIVE_AI ?? 'fixture', checks: ['first PC connection returns to room', 'single click reuse', 'draft and 2 human DM preserved', 'peer asks and both see AI reply', 'text attachment context', 'uninvited room excluded', 'Composer AI mention executes', 'mobile 390/360 and back navigation'], artifacts }))
} catch (error) {
  for (const [i, context] of browser.contexts().entries()) for (const [j, page] of context.pages().entries())
    await page.screenshot({ path: `${artifacts}/failure-${i}-${j}.png` }).catch(() => {})
  throw error
} finally {
  runner?.stop(); await browser.close(); await app.close(); await testDb.$disconnect(); await prisma.$disconnect()
}
