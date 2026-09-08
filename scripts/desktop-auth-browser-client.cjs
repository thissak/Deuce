// Test-only browser: the simulated Google redirect arrives through stdin, never argv/logs.
const { app, BrowserWindow } = require('electron')
let input = ''
process.stdin.on('data', c => { input += c })
process.stdin.on('end', async () => {
  const { callback } = JSON.parse(input)
  await app.whenReady()
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
  const timeout = setTimeout(() => { console.error('browser callback timeout'); app.exit(1) }, 15000)
  try {
    await win.loadURL(callback)
    const ok = await win.webContents.executeJavaScript('document.body.innerText.includes("듀스 앱으로 돌아가세요")')
    clearTimeout(timeout); win.destroy(); app.exit(ok ? 0 : 1)
  } catch { clearTimeout(timeout); win.destroy(); app.exit(1) }
})
