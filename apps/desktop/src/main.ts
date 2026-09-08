import { app, BrowserWindow, Menu, Tray, nativeImage, shell, dialog, session, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { parseSetCookie } from 'cookie'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { APP_ORIGIN, WEBSOCKET_ORIGIN, trustedUrl, externalUrl } from './security'
import { desktopLogin } from './login'

app.setAppUserModelId('dev.goldenlabs.deuce')
let win: BrowserWindow; let tray: Tray; let quitting = false; let signingIn = false
function focus() { if (win.isMinimized()) win.restore(); win.show(); win.focus() }
async function login() {
  if (signingIn) { focus(); return }
  signingIn = true
  try {
    win.setTitle('Deuce — 브라우저에서 로그인 중')
    const credentials = JSON.parse(readFileSync(join(app.getAppPath(), 'build/google-desktop.json'), 'utf8')).installed
    const headers = await desktopLogin(APP_ORIGIN, (url) => shell.openExternal(url), credentials)
    let sessionInstalled = false
    for (const header of headers) {
      const c = parseSetCookie(header, { decode: (value) => value })
      if (c.name !== 'session' || !c.value || !c.httpOnly || !c.secure) continue
      await win.webContents.session.cookies.set({ url: APP_ORIGIN, name: c.name, value: c.value, path: '/', secure: true, httpOnly: true, sameSite: 'lax', expirationDate: Date.now() / 1000 + (c.maxAge ?? 14 * 86400) })
      sessionInstalled = true
    }
    if (!sessionInstalled) throw new Error('Secure app session missing')
    await win.webContents.session.cookies.flushStore()
    await win.loadURL(`${APP_ORIGIN}/chat`); focus()
  } catch {
    await dialog.showMessageBox(win, { type: 'error', message: '로그인을 완료하지 못했습니다.', detail: '인터넷 연결을 확인하고 다시 로그인해 주세요. 브라우저에서 Google 로그인을 완료해 주세요.' })
  } finally { signingIn = false; win.setTitle('Deuce') }
}
function navigate(event: Electron.Event, url: string) {
  if (trustedUrl(url) && new URL(url).pathname === '/auth/google') { event.preventDefault(); void login(); return }
  if (!trustedUrl(url)) { event.preventDefault(); if (externalUrl(url)) void shell.openExternal(url) }
}
let checking = false
async function checkUpdates(manual = false) {
  if (!app.isPackaged || checking) return
  checking = true
  try {
    const result = await autoUpdater.checkForUpdates()
    if (manual && result?.updateInfo.version === app.getVersion()) await dialog.showMessageBox(win, { message: '최신 버전입니다.' })
  } catch { if (manual) await dialog.showMessageBox(win, { message: '업데이트를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' }) }
  finally { checking = false }
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { if (win) focus() })
  app.on('before-quit', () => { quitting = true })
  app.on('activate', () => { if (win) focus() })
  void app.whenReady().then(async () => {
    const ses = session.fromPartition('persist:deuce')
    ses.setPermissionRequestHandler((contents, permission, callback, details) => callback(trustedUrl(contents.getURL()) && trustedUrl(details.requestingUrl) && ['notifications', 'clipboard-sanitized-write'].includes(permission)))
    ses.setPermissionCheckHandler((contents, permission, origin) => !!contents && trustedUrl(contents.getURL()) && trustedUrl(origin) && ['notifications', 'clipboard-sanitized-write'].includes(permission))
    ses.webRequest.onHeadersReceived({ urls: [`${APP_ORIGIN}/*`] }, (details, callback) => callback({ responseHeaders: { ...details.responseHeaders,
      'Content-Security-Policy': [`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' ${WEBSOCKET_ORIGIN}; font-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'self'`] } }))
    win = new BrowserWindow({ width: 1220, height: 820, minWidth: 760, minHeight: 520, title: 'Deuce', show: false,
      icon: join(app.getAppPath(), 'build/icon.png'), webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false, preload: join(__dirname, 'preload.cjs') } })
    win.once('ready-to-show', focus)
    win.on('close', (event) => { if (!quitting) { event.preventDefault(); win.hide() } })
    win.webContents.on('will-navigate', navigate)
    win.webContents.on('will-redirect', navigate)
    win.webContents.on('will-attach-webview', (event) => event.preventDefault())
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (trustedUrl(url)) {
        if (/^\/api\/attachments\//.test(new URL(url).pathname)) win.webContents.downloadURL(url)
        else void win.loadURL(url)
      } else if (externalUrl(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    ipcMain.on('deuce:focus', (event) => { if (event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && trustedUrl(event.senderFrame.url)) focus() })
    win.webContents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
      if (!mainFrame || code === -3) return
      void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>Deuce</title><body style="font-family:system-ui;padding:60px"><h1>듀스에 연결하지 못했습니다.</h1><p>인터넷 연결을 확인하고 다시 시도해 주세요.</p><a href="${APP_ORIGIN}/chat">다시 연결</a></body></html>`)}`)
    })
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Deuce', submenu: [{ label: 'Deuce 열기', click: focus }, { label: '브라우저에서 로그인', click: () => void login() }, { label: '업데이트 확인', click: () => void checkUpdates(true) }, { type: 'separator' }, { role: 'quit', label: 'Deuce 종료' }] },
      { role: 'editMenu', label: '편집' }, { label: '보기', submenu: [{ role: 'reload', label: '새로고침' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    ]))
    tray = new Tray(nativeImage.createFromPath(join(app.getAppPath(), 'build/icon.png')).resize({ width: 18, height: 18 }))
    tray.setToolTip('Deuce'); tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Deuce 열기', click: focus }, { label: '종료', click: () => app.quit() }]))
    tray.on('click', focus)
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.on('error', () => { console.warn('desktop.update.failed') })
    autoUpdater.on('update-available', async () => {
      const r = await dialog.showMessageBox(win, { message: '새 버전이 있습니다.', buttons: ['다운로드', '나중에'], cancelId: 1 })
      if (r.response === 0) void autoUpdater.downloadUpdate().catch(() => {})
    })
    autoUpdater.on('update-downloaded', async () => {
      const r = await dialog.showMessageBox(win, { message: '업데이트를 설치할 준비가 됐습니다.', detail: '전송 중인 메시지를 확인한 뒤 재시작하세요.', buttons: ['재시작하고 설치', '나중에'], cancelId: 1 })
      if (r.response === 0) { quitting = true; autoUpdater.quitAndInstall() }
    })
    await win.loadURL(`${APP_ORIGIN}/chat`).catch(() => {})
    void checkUpdates()
    setInterval(() => void checkUpdates(), 4 * 60 * 60_000).unref()
  })
}
