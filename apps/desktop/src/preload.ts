import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('deuceDesktop', {
  focus: () => ipcRenderer.send('deuce:focus'),
  setUnreadCount: (count: number) => ipcRenderer.send('deuce:set-unread-count', count),
})
