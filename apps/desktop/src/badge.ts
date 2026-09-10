import { app, ipcMain, type BrowserWindow } from 'electron'
import { trustedUrl } from './security'
import { badgeImage } from './badge-image'

export function attachDesktopBadge(win: BrowserWindow): void {
  const update = (count: number) => {
    if (process.platform === 'win32') win.setOverlayIcon(count > 0 ? badgeImage(count) : null, count > 0 ? `읽지 않은 글 ${count}개` : '')
    else app.dock?.setBadge(count > 0 ? String(count) : '')
  }
  const clear = () => update(0)
  clear()
  ipcMain.on('deuce:set-unread-count', (event, count: unknown) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || !trustedUrl(event.senderFrame.url)) return
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return
    update(count)
  })
  // Full navigation includes logout/relogin; route changes keep the current count.
  win.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) clear()
  })
  win.webContents.on('render-process-gone', clear)
}
