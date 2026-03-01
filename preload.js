const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getPrefs: () => ipcRenderer.invoke('get-prefs'),
  createClawDir: () => ipcRenderer.invoke('create-claw-dir'),
  selectClawDir: () => ipcRenderer.invoke('select-claw-dir'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (c) => ipcRenderer.invoke('save-config', c),
  buildSystemPrompt: () => ipcRenderer.invoke('build-system-prompt'),
  chat: (msg) => ipcRenderer.invoke('chat', msg),
  chatPrepare: () => ipcRenderer.invoke('chat-prepare'),
  onToken: (cb) => {
    ipcRenderer.on('chat-token', (_, d) => cb(d))
  },
  onToolStep: (cb) => {
    ipcRenderer.on('chat-tool-step', (_, d) => cb(d))
  },
  onTextStart: (cb) => {
    ipcRenderer.on('chat-text-start', (_, d) => cb(d))
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
  // Tasks
  listTasks: (sessionId) => ipcRenderer.invoke('session-tasks', sessionId),
  onTasksChanged: (cb) => { ipcRenderer.removeAllListeners('tasks-changed'); ipcRenderer.on('tasks-changed', (_, sid) => cb(sid)) },
  onAgentMessage: (cb) => { ipcRenderer.removeAllListeners('agent-message'); ipcRenderer.on('agent-message', (_, d) => cb(d)) },
  onAutoRotate: (cb) => { ipcRenderer.removeAllListeners('auto-rotate'); ipcRenderer.on('auto-rotate', (_, d) => cb(d)) },
  // Heartbeat
  heartbeatStart: () => ipcRenderer.invoke('heartbeat-start'),
  heartbeatStop: () => ipcRenderer.invoke('heartbeat-stop'),
  onHeartbeat: (cb) => ipcRenderer.on('heartbeat-result', (_, r) => cb(r)),
  onStatus: (cb) => { ipcRenderer.removeAllListeners('agent-status'); ipcRenderer.on('agent-status', (_, s) => cb(s)) },
  onWatsonStatus: (cb) => { ipcRenderer.on('watson-status', (_, s) => cb(s)) },
  onTrayNewChat: (cb) => { ipcRenderer.on('tray-new-chat', () => cb()) },
  // File operations
  openFile: (p) => ipcRenderer.invoke('open-file', p),
  openFilePreview: (p) => ipcRenderer.invoke('open-file-preview', p),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  readFile: (p) => ipcRenderer.invoke('read-file', p),
  // Memory watch
  onMemoryChanged: (cb) => { ipcRenderer.removeAllListeners('memory-changed'); ipcRenderer.on('memory-changed', (_, d) => cb(d)) },
  // Notify
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
})
