const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getPrefs: () => ipcRenderer.invoke('get-prefs'),
  selectClawDir: () => ipcRenderer.invoke('select-claw-dir'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (c) => ipcRenderer.invoke('save-config', c),
  buildSystemPrompt: () => ipcRenderer.invoke('build-system-prompt'),
  chat: (msg) => ipcRenderer.invoke('chat', msg),
})
