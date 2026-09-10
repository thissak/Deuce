import { expect, it, vi } from 'vitest'

it('exposes focus and unread badges without any AI connection capability', async () => {
  const expose = vi.fn(), send = vi.fn()
  vi.doMock('electron', () => ({ contextBridge: { exposeInMainWorld: expose }, ipcRenderer: { send } }))
  try {
    await import('../src/preload')
    expect(expose.mock.calls[0]?.[0]).toBe('deuceDesktop')
    const api = expose.mock.calls[0]?.[1]
    expect(Object.keys(api).sort()).toEqual(['focus', 'setUnreadCount'])
    api.focus(); api.setUnreadCount(3)
    expect(send.mock.calls).toEqual([['deuce:focus'], ['deuce:set-unread-count', 3]])
  } finally { vi.doUnmock('electron'); vi.resetModules() }
})
