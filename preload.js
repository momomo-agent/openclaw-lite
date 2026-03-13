const { contextBridge, ipcRenderer } = require('electron')

// ── Helper: create a clean IPC event listener bridge ──
// Returns cleanup function. No removeAllListeners — lifecycle owned by React useEffect.
function onIpc(channel, cb) {
  const handler = (_, d) => cb(d)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('api', {
  getFeatureFlags: () => ipcRenderer.invoke('get-feature-flags'),
  getRuntimeState: () => ipcRenderer.invoke('get-runtime-state'),
  // Agent registry (M32 — agents = workspace folders with SOUL.md + identity)
  listWorkspaces: () => ipcRenderer.invoke('workspaces-list'),
  addWorkspace: (wsPath) => ipcRenderer.invoke('workspace-add', wsPath),
  removeWorkspace: (id) => ipcRenderer.invoke('workspace-remove', id),
  createWorkspace: (opts) => ipcRenderer.invoke('workspace-create', opts),
  updateWorkspaceIdentity: (opts) => ipcRenderer.invoke('workspace-update-identity', opts),
  setWorkspaceAvatar: (opts) => ipcRenderer.invoke('workspace-set-avatar', opts),
  getPrefs: () => ipcRenderer.invoke('get-prefs'),
  getUserProfile: () => ipcRenderer.invoke('get-user-profile'),
  setUserProfile: (opts) => ipcRenderer.invoke('set-user-profile', opts),
  getUserAvatarPath: () => ipcRenderer.invoke('get-user-avatar-path'),
  pickImage: () => ipcRenderer.invoke('pick-image'),
  createClawDir: () => ipcRenderer.invoke('create-claw-dir'),
  selectClawDir: () => ipcRenderer.invoke('select-claw-dir'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  getTokenUsage: (sessionId) => ipcRenderer.invoke('get-token-usage', sessionId),
  chatCancel: () => ipcRenderer.invoke('chat-cancel'),
  exportSession: (id) => ipcRenderer.invoke('session-export', id),
  writeExport: (filename, content) => ipcRenderer.invoke('write-export', filename, content),
  saveConfig: (c) => ipcRenderer.invoke('save-config', c),
  buildSystemPrompt: () => ipcRenderer.invoke('build-system-prompt'),
  chat: (msg) => ipcRenderer.invoke('chat', msg),
  chatPrepare: () => ipcRenderer.invoke('chat-prepare'),
  updateMessageMeta: (sessionId, messageId, fields) => ipcRenderer.invoke('message-update-meta', { sessionId, messageId, fields }),
  deleteMessage: (sessionId, messageId) => ipcRenderer.invoke('message-delete', { sessionId, messageId }),
  chatRoute: (msg) => ipcRenderer.invoke('chat-route', msg),
  // ── Streaming events (single consumer: ChatView) ──
  onToken: (cb) => onIpc('chat-token', cb),
  onToolStep: (cb) => onIpc('chat-tool-step', cb),
  onRoundInfo: (cb) => onIpc('chat-round-info', cb),
  onTextStart: (cb) => onIpc('chat-text-start', cb),
  onChatDone: (cb) => onIpc('chat-done', cb),
  onChatError: (cb) => onIpc('chat-error', cb),
  // Sessions
  listSessions: (opts) => ipcRenderer.invoke('sessions-list', opts),
  loadSession: (id) => ipcRenderer.invoke('session-load', id),
  saveSession: (s) => ipcRenderer.invoke('session-save', s),
  createSession: (opts) => ipcRenderer.invoke('session-create', opts),
  deleteSession: (id) => ipcRenderer.invoke('session-delete', id),
  renameSession: (id, title) => ipcRenderer.invoke('session-rename', id, title),
  // Agents
  listAgents: () => ipcRenderer.invoke('agents-list'),
  loadAgent: (id) => ipcRenderer.invoke('agent-load', id),
  saveAgent: (a) => ipcRenderer.invoke('agent-save', a),
  createAgent: (opts) => ipcRenderer.invoke('agent-create', opts),
  deleteAgent: (id) => ipcRenderer.invoke('agent-delete', id),
  resetClawDir: () => ipcRenderer.invoke('reset-claw-dir'),
  openClawDir: () => ipcRenderer.invoke('open-claw-dir'),
  // Session members (legacy)
  addMember: (sessionId, agentId) => ipcRenderer.invoke('session-add-member', { sessionId, agentId }),
  removeMember: (sessionId, agentId) => ipcRenderer.invoke('session-remove-member', { sessionId, agentId }),
  // Session participants (M32 group chat)
  addParticipant: (sessionId, workspaceId) => ipcRenderer.invoke('session-add-participant', { sessionId, workspaceId }),
  removeParticipant: (sessionId, workspaceId) => ipcRenderer.invoke('session-remove-participant', { sessionId, workspaceId }),
  getParticipants: (sessionId) => ipcRenderer.invoke('session-get-participants', sessionId),
  getSessionParticipantsParsed: (sessionId) => ipcRenderer.invoke('session-get-participants-parsed', sessionId),
  // Session agents (M19: lightweight agents)
  createSessionAgent: (sessionId, opts) => ipcRenderer.invoke('session-create-agent', { sessionId, ...opts }),
  listSessionAgents: (sessionId) => ipcRenderer.invoke('session-list-agents', sessionId),
  deleteSessionAgent: (agentId) => ipcRenderer.invoke('session-delete-agent', agentId),
  onSessionAgentsChanged: (cb) => onIpc('session-agents-changed', cb),
  // Tasks
  listTasks: (sessionId) => ipcRenderer.invoke('session-tasks', sessionId),
  onTasksChanged: (cb) => onIpc('tasks-changed', cb),
  onAgentMessage: (cb) => onIpc('agent-message', cb),
  onAutoRotate: (cb) => onIpc('auto-rotate', cb),
  // Heartbeat
  heartbeatStart: () => ipcRenderer.invoke('heartbeat-start'),
  heartbeatStop: () => ipcRenderer.invoke('heartbeat-stop'),
  // MCP
  getMcpStatus: () => ipcRenderer.invoke('mcp-status'),
  mcpReconnect: () => ipcRenderer.invoke('mcp-reconnect'),
  onHeartbeat: (cb) => onIpc('heartbeat-result', cb),
  // ── Status events (watson-status has two consumers: App + ChatView) ──
  onStatus: (cb) => onIpc('agent-status', cb),
  onWatsonStatus: (cb) => onIpc('watson-status', cb),
  onSessionTitleUpdated: (cb) => onIpc('session-title-updated', cb),
  onTrayNewChat: (cb) => onIpc('tray-new-chat', cb),
  // File operations
  openFile: (p) => ipcRenderer.invoke('open-file', p),
  openFilePreview: (p) => ipcRenderer.invoke('open-file-preview', p),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  readFile: (p) => ipcRenderer.invoke('read-file', p),
  // Memory watch
  onMemoryChanged: (cb) => onIpc('memory-changed', cb),
  // Notify
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
  // Status persistence
  updateSessionStatus: (sessionId, level, text) => ipcRenderer.invoke('update-session-status', { sessionId, level, text }),
  // Coding agent
  getCodingAgent: () => ipcRenderer.invoke('get-coding-agent'),
  setCodingAgent: (agent) => ipcRenderer.invoke('set-coding-agent', agent),
  listCodingAgents: () => ipcRenderer.invoke('list-coding-agents'),
  // Coding agent registry (F206)
  codingAgentsList: () => ipcRenderer.invoke('coding-agents-list'),
  codingAgentAdd: (opts) => ipcRenderer.invoke('coding-agent-add', opts),
  codingAgentDelete: (id) => ipcRenderer.invoke('coding-agent-delete', id),
  // ── Delegate events (single consumer: ChatView) ──
  onDelegateStart: (cb) => onIpc('chat-delegate-start', cb),
  onDelegateToken: (cb) => onIpc('chat-delegate-token', cb),
  onDelegateEnd: (cb) => onIpc('chat-delegate-end', cb),
  // Claude Code
})
