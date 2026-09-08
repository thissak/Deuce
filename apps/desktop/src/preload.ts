import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('deuceDesktop', { focus: () => ipcRenderer.send('deuce:focus') })
