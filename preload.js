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
  // Agents
  listAgents: () => ipcRenderer.invoke('agents-list'),
  loadAgent: (id) => ipcRenderer.invoke('agent-load', id),
  saveAgent: (a) => ipcRenderer.invoke('agent-save', a),
  createAgent: (opts) => ipcRenderer.invoke('agent-create', opts),
  deleteAgent: (id) => ipcRenderer.invoke('agent-delete', id),
  openClawDir: () => ipcRenderer.invoke('open-claw-dir'),
  // Session members
  addMember: (sessionId, agentId) => ipcRenderer.invoke('session-add-member', { sessionId, agentId }),
  removeMember: (sessionId, agentId) => ipcRenderer.invoke('session-remove-member', { sessionId, agentId }),
  // Heartbeat
  heartbeatStart: () => ipcRenderer.invoke('heartbeat-start'),
  heartbeatStop: () => ipcRenderer.invoke('heartbeat-stop'),
  onHeartbeat: (cb) => ipcRenderer.on('heartbeat-result', (_, r) => cb(r)),
  onStatus: (cb) => { ipcRenderer.removeAllListeners('agent-status'); ipcRenderer.on('agent-status', (_, s) => cb(s)) },
  // File operations
  openFile: (p) => ipcRenderer.invoke('open-file', p),
  readFile: (p) => ipcRenderer.invoke('read-file', p),
  // Notify
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
})
