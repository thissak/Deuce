#!/usr/bin/env node
// Temporary main-process observer for a signed, installed Mac app. It does not
// replace updater methods, its feed, downloads, dialogs, or installation.
const path = require('node:path')

async function main() {
  const port = Number(process.argv[2] || 5496)
  const receipt = path.resolve(process.argv[3] || '/tmp/deuce-update-events.jsonl')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  let id = 0
  const pending = new Map()
  let onPause
  const paused = new Promise(resolve => { onPause = resolve })
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id
    pending.set(requestId, { resolve, reject })
    ws.send(JSON.stringify({ id: requestId, method, params }))
  })
  ws.addEventListener('message', event => {
    const value = JSON.parse(event.data)
    if (value.method === 'Debugger.paused') onPause(value.params.callFrames[0])
    const request = pending.get(value.id)
    if (!request) return
    pending.delete(value.id)
    value.error ? request.reject(new Error(value.error.message)) : request.resolve(value.result)
  })
  try {
    await call('Debugger.enable')
    await call('Runtime.runIfWaitingForDebugger')
    const frame = await Promise.race([paused, new Promise((_, reject) => setTimeout(() => reject(new Error('App must be started with --inspect-brk')), 15000))])
    const expression = `(() => {
      const { app, autoUpdater: nativeUpdater } = require('electron');
      const updater = require('electron-updater').autoUpdater;
      const fs = require('node:fs');
      const output = ${JSON.stringify(receipt)};
      const record = (event, data = {}) => fs.appendFileSync(output, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, event, ...data }) + '\\n', { mode: 0o600 });
      record('observer.attached', { version: app.getVersion(), arch: process.arch, packaged: app.isPackaged, appPath: app.getAppPath() });
      for (const event of ['checking-for-update', 'update-available', 'update-not-available', 'update-downloaded', 'update-cancelled']) {
        updater.on(event, info => record(event, { version: info?.version, downloadedFile: info?.downloadedFile }));
      }
      let lastBucket = -1;
      updater.on('download-progress', info => {
        const bucket = Math.floor(info.percent / 10);
        if (bucket !== lastBucket) { lastBucket = bucket; record('download-progress', { percent: Math.round(info.percent), transferred: info.transferred, total: info.total }); }
      });
      updater.on('error', error => record('updater.error', { code: error.code, message: String(error.message).split('\\n')[0].replace(/Bearer\\s+\\S+/gi, 'Bearer [redacted]').replace(/deuce_[A-Za-z0-9_-]{30,}/g, '[redacted]') }));
      nativeUpdater.on('update-downloaded', () => record('native.update-downloaded'));
      nativeUpdater.on('error', error => record('native.error', { message: String(error.message).split('\\n')[0] }));
      app.on('before-quit', () => record('app.before-quit'));
      app.on('quit', () => record('app.quit'));
      app.on('browser-window-created', (_, window) => {
        window.webContents.once('did-finish-load', async () => {
          if (!window.webContents.getURL().startsWith('https://deuce.goldenlabs.dev/')) return;
          try {
            const status = await window.webContents.executeJavaScript('fetch("/auth/me").then(r => r.status)');
            record('session.checked', { status });
          } catch { record('session.check-failed'); }
        });
      });
      return { attached: true, version: app.getVersion() };
    })()`
    const result = await call('Debugger.evaluateOnCallFrame', { callFrameId: frame.callFrameId, expression, returnByValue: true })
    if (result.exceptionDetails) throw new Error('Observer could not attach in the application entry point')
    console.log(JSON.stringify({ ...result.result.value, receipt }))
    await call('Debugger.resume')
    await call('Debugger.disable')
  } finally {
    // Leaving the debugger attached can prevent Node/Electron from exiting.
    ws.close()
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
