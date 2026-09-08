import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('deuceDesktop', {
  focus: () => ipcRenderer.send('deuce:focus'),
  connectAgent: (connection: { agentId: string; token: string; provider: 'codex' | 'claude' }) => ipcRenderer.invoke('deuce:connect-agent', connection),
})
