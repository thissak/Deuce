// pnpm --filter @deuce/desktop exec electron ../../scripts/desktop-badge-smoke.cjs
// Isolated macOS Electron smoke: real preload IPC and Dock API, no server/session access.
const { app, BrowserWindow, session } = require('electron')
const { createRequire } = require('node:module')
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const assert = require('node:assert/strict')
const root = resolve(__dirname, '..')
const desktopRequire = createRequire(join(root, 'apps/desktop/package.json'))
const directory = mkdtempSync(join(tmpdir(), 'deuce-badge-smoke-'))
app.setPath('userData', directory)

app.whenReady().then(async () => {
  assert.equal(process.platform, 'darwin', 'Dock smoke requires macOS')
  desktopRequire('esbuild').buildSync({
    entryPoints: [join(root, 'apps/desktop/src/badge.ts')], bundle: true,
    platform: 'node', format: 'cjs', external: ['electron'], outfile: join(directory, 'badge.cjs'),
  })
  const { attachDesktopBadge } = require(join(directory, 'badge.cjs'))
  desktopRequire('esbuild').buildSync({
    entryPoints: [join(root, 'apps/desktop/src/badge-image.ts')], bundle: true,
    platform: 'node', format: 'cjs', external: ['electron'], outfile: join(directory, 'badge-image.cjs'),
  })
  const { badgeImage } = require(join(directory, 'badge-image.cjs'))
  for (const count of [3, 12, 99, 100]) {
    const icon = badgeImage(count)
    assert.deepEqual(icon.getSize(), { width: 16, height: 16 })
    assert.equal(icon.isEmpty(), false)
    if (process.env.DEUCE_BADGE_PREVIEW_DIR) writeFileSync(join(process.env.DEUCE_BADGE_PREVIEW_DIR, `overlay-${count}.png`), icon.toPNG())
  }
  assert.deepEqual(badgeImage(100).toPNG(), badgeImage(1000).toPNG())
  const isolated = session.fromPartition('badge-smoke')
  isolated.protocol.handle('https', () => new Response('<!doctype html><title>Badge smoke</title>'))
  const win = new BrowserWindow({ show: false, webPreferences: {
    session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false,
    preload: join(root, 'apps/desktop/dist/preload.cjs'),
  } })
  attachDesktopBadge(win)
  const waitForBadge = async (expected) => {
    const deadline = Date.now() + 5000
    while (app.dock.getBadge() !== expected && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20))
    assert.equal(app.dock.getBadge(), expected)
  }
  await win.loadURL('https://deuce.goldenlabs.dev/chat')
  for (const count of [3, 12, 0]) {
    await win.webContents.executeJavaScript(`window.deuceDesktop.setUnreadCount(${count})`)
    await waitForBadge(count ? String(count) : '')
  }
  await win.webContents.executeJavaScript('window.deuceDesktop.setUnreadCount(7)')
  await waitForBadge('7')
  await win.loadURL('https://deuce.goldenlabs.dev/')
  await waitForBadge('')
  win.destroy()
  console.log('PASS: real preload IPC → Dock 3 → 12 → clear; full navigation clears 7; Windows overlay images 3/12/99/99+')
}).then(() => app.exit(0), (error) => { console.error(error); app.exit(1) })
app.on('quit', () => rmSync(directory, { recursive: true, force: true }))
