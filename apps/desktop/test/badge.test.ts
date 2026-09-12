import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'

const { setBadge, ipcMain } = vi.hoisted(() => ({ setBadge: vi.fn(), ipcMain: { on: vi.fn() } }))
vi.mock('electron', () => ({ app: { dock: { setBadge } }, ipcMain }))
vi.mock('../src/badge-image', () => ({ badgeImage: (count: number) => ({ count }) }))
import { attachDesktopBadge } from '../src/badge'

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.restoreAllMocks())

function setup() {
  const webContents = Object.assign(new EventEmitter(), { mainFrame: { url: 'https://deuce.goldenlabs.dev/chat' } })
  const setOverlayIcon = vi.fn()
  attachDesktopBadge({ webContents, setOverlayIcon } as unknown as BrowserWindow)
  const receive = ipcMain.on.mock.calls[0]![1] as (event: unknown, count: unknown) => void
  return { webContents, receive, setOverlayIcon, event: { sender: webContents, senderFrame: webContents.mainFrame } }
}

it('Dock에 숫자를 표시하고 0·전체 탐색·renderer 종료 때 지운다', () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
  const { webContents, receive, event } = setup()
  expect(ipcMain.on.mock.calls[0]![0]).toBe('deuce:set-unread-count')
  expect(setBadge).toHaveBeenLastCalledWith('')
  receive(event, 3)
  expect(setBadge).toHaveBeenLastCalledWith('3')
  webContents.emit('did-start-navigation', {}, '/activity', true, true)
  expect(setBadge).toHaveBeenLastCalledWith('3')
  webContents.emit('did-start-navigation', {}, '/', false, false)
  expect(setBadge).toHaveBeenLastCalledWith('3')
  receive(event, 0)
  expect(setBadge).toHaveBeenLastCalledWith('')
  receive(event, 123)
  expect(setBadge).toHaveBeenLastCalledWith('123')
  webContents.emit('did-start-navigation', {}, '/', false, true)
  expect(setBadge).toHaveBeenLastCalledWith('')
  receive(event, 2)
  webContents.emit('render-process-gone')
  expect(setBadge).toHaveBeenLastCalledWith('')
})

it('Windows 작업 표시줄에 숫자 오버레이를 표시하고 읽음·탐색 때 지운다', () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  const { receive, event, setOverlayIcon, webContents } = setup()
  expect(setOverlayIcon).toHaveBeenLastCalledWith(null, '')
  receive(event, 123)
  expect(setOverlayIcon).toHaveBeenLastCalledWith({ count: 123 }, '읽지 않은 글 123개')
  receive(event, 0)
  expect(setOverlayIcon).toHaveBeenLastCalledWith(null, '')
  receive(event, 3)
  webContents.emit('did-start-navigation', {}, '/', false, true)
  expect(setOverlayIcon).toHaveBeenLastCalledWith(null, '')
  expect(setBadge).not.toHaveBeenCalled()
})

it('다른 창·iframe·외부 원점과 잘못된 숫자의 IPC는 거부한다', () => {
  const { webContents, receive, event } = setup()
  setBadge.mockClear()
  receive({ ...event, sender: {} }, 5)
  receive({ ...event, senderFrame: { url: webContents.mainFrame.url } }, 5)
  webContents.mainFrame.url = 'https://example.com/chat'
  receive(event, 5)
  webContents.mainFrame.url = 'https://deuce.goldenlabs.dev/chat'
  for (const count of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '3', null, {}]) receive(event, count)
  expect(setBadge).not.toHaveBeenCalled()
})
