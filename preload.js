const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getPrefs: () => ipcRenderer.invoke('get-prefs'),
  createClawDir: () => ipcRenderer.invoke('create-claw-dir'),
  selectClawDir: () => ipcRenderer.invoke('select-claw-dir'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (c) => ipcRenderer.invoke('save-config', c),
  buildSystemPrompt: () => ipcRenderer.invoke('build-system-prompt'),
  chat: (msg) => ipcRenderer.invoke('chat', msg),
  onToken: (cb) => {
    ipcRenderer.removeAllListeners('chat-token')
    ipcRenderer.on('chat-token', (_, t) => cb(t))
  },
  onChatDone: (cb) => ipcRenderer.on('chat-done', (_, r) => cb(r)),
  onChatError: (cb) => ipcRenderer.on('chat-error', (_, e) => cb(e)),
  // Sessions
  listSessions: () => ipcRenderer.invoke('sessions-list'),
  loadSession: (id) => ipcRenderer.invoke('session-load', id),
  saveSession: (s) => ipcRenderer.invoke('session-save', s),
  createSession: (t) => ipcRenderer.invoke('session-create', t),
  deleteSession: (id) => ipcRenderer.invoke('session-delete', id),
  exportSession: (id) => ipcRenderer.invoke('session-export', id),
})
