const { app, BrowserWindow, ipcMain, dialog, Menu, shell, Notification, Tray, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const vm = require('vm')
const { spawn } = require('child_process')
const memoryIndex = require('./memory-index')
const { getTool, getAnthropicTools, getToolsPrompt } = require('./tools')
const { loadAllSkills } = require('./skills/frontmatter')

// ── Core modules (M18 refactor) ──
const state = require('./core/state')
const { globalConfigPath, loadGlobalConfig, saveGlobalConfig } = require('./core/config')
const { getApiKey, rotateApiKey, recordKeyUsage } = require('./core/api-keys')
const { estimateTokens: coreEstimateTokens, estimateMessagesTokens: coreEstimateMessagesTokens } = require('./core/compaction')
const { pruneToolResults } = require('./core/session-pruning')
const { LoopDetector } = require('./core/loop-detection')
const { FailoverManager } = require('./core/failover')
const { fetchWithRetry } = require('./core/api-retry')
const { enforceContextBudget } = require('./core/context-guard')
const { sanitizeTranscript } = require('./core/transcript-repair')
const workspaceRegistry = require('./core/workspace-registry')

// ── Feature flags ──
const LEGACY_AGENT_FEATURES = false  // M19 lightweight agents, task bar, auto-rotate (M32: disabled, not deleted)

// ── Helper functions (must be defined early) ──
let _activeRequestId = null
let _activeAbortController = null

function pushStatus(win, state, detail) {
  win?.webContents?.send('agent-status', { state, detail })
  if (tray) tray.setToolTip(`Paw - ${detail || state}`)
}

function sendNotification(title, body) {
  if (Notification.isSupported()) new Notification({ title, body }).show()
}
const { resolveContextWindow } = require('./core/model-context')
const { SessionExpiry } = require('./core/session-expiry')

const failoverManager = new FailoverManager()
let _lastAnthropicCallTime = 0

// Tool result truncation — OpenClaw-aligned: head+tail, preserves error info at tail
const TOOL_RESULT_MAX_SHARE = 0.3       // Max 30% of context window per result
const TOOL_RESULT_HARD_MAX = 400000     // Hard cap even for large context windows
const TOOL_RESULT_MIN_KEEP = 2000       // Always keep at least this much
const TRUNCATION_SUFFIX = '\n\n⚠️ [Content truncated — original was too large. Use offset/limit to read smaller chunks.]'
const MIDDLE_OMISSION = '\n\n⚠️ [... middle content omitted — showing head and tail ...]\n\n'

// API error classification — OpenClaw-aligned
function isContextOverflowError(status, body) {
  if (status === 400) {
    const lower = (body || '').toLowerCase()
    return lower.includes('context') || lower.includes('too many tokens') ||
      lower.includes('maximum context length') || lower.includes('prompt is too long')
  }
  return false
}

function isBillingError(status, body) {
  return status === 402 || (status === 400 && (body || '').toLowerCase().includes('billing'))
}

// Anthropic magic string scrub — prevent refusal test injection
const ANTHROPIC_MAGIC = 'ANTHROPIC_MAGIC_STRING_TRIGGER_REFUSAL'
function scrubMagicStrings(text) {
  if (!text || !text.includes(ANTHROPIC_MAGIC)) return text
  return text.replaceAll(ANTHROPIC_MAGIC, 'ANTHROPIC MAGIC STRING (redacted)')
}

function hasImportantTail(text) {
  const tail = text.slice(-2000).toLowerCase()
  return /\b(error|exception|failed|fatal|traceback|panic|errno|exit code)\b/.test(tail)
    || /\}\s*$/.test(tail.trim())
    || /\b(total|summary|result|complete|finished|done)\b/.test(tail)
}

function calculateMaxToolResultChars(contextWindowTokens) {
  const maxTokens = Math.floor((contextWindowTokens || 200000) * TOOL_RESULT_MAX_SHARE)
  return Math.min(maxTokens * 4, TOOL_RESULT_HARD_MAX)
}

function truncateToolResult(result, contextWindowTokens) {
  const s = String(result)
  const maxChars = calculateMaxToolResultChars(contextWindowTokens)
  if (s.length <= maxChars) return s

  const budget = Math.max(TOOL_RESULT_MIN_KEEP, maxChars - TRUNCATION_SUFFIX.length)

  // Head+tail strategy if tail has important content (errors, summaries)
  if (hasImportantTail(s) && budget > TOOL_RESULT_MIN_KEEP * 2) {
    const tailBudget = Math.min(Math.floor(budget * 0.3), 4000)
    const headBudget = budget - tailBudget - MIDDLE_OMISSION.length
    if (headBudget > TOOL_RESULT_MIN_KEEP) {
      let headCut = headBudget
      const headNl = s.lastIndexOf('\n', headBudget)
      if (headNl > headBudget * 0.8) headCut = headNl
      let tailStart = s.length - tailBudget
      const tailNl = s.indexOf('\n', tailStart)
      if (tailNl !== -1 && tailNl < tailStart + tailBudget * 0.2) tailStart = tailNl + 1
      return s.slice(0, headCut) + MIDDLE_OMISSION + s.slice(tailStart) + TRUNCATION_SUFFIX
    }
  }

  // Default: keep head
  let cutPoint = budget
  const lastNl = s.lastIndexOf('\n', budget)
  if (lastNl > budget * 0.8) cutPoint = lastNl
  return s.slice(0, cutPoint) + TRUNCATION_SUFFIX
}
const { extractLinkContext: coreExtractLinkContext } = require('./core/link-extract')
const { listAgents: coreListAgents, loadAgent: coreLoadAgent, saveAgent: coreSaveAgent, createAgent: coreCreateAgent, agentsDir: coreAgentsDir } = require('./core/agents')
const { pushStatus: corePushStatus, sendNotification: coreSendNotification, pushWatsonStatus: corePushWatsonStatus } = require('./core/notify')
const { startHeartbeat: coreStartHeartbeat, stopHeartbeat: coreStopHeartbeat } = require('./core/heartbeat')
const { updateTrayMenu: coreUpdateTrayMenu } = require('./core/tray')
const { buildMemoryIndex: coreBuildMemoryIndex, startMemoryWatch: coreStartMemoryWatch, stopMemoryWatch: coreStopMemoryWatch } = require('./core/memory-watch')
const { buildSystemPrompt: coreBuildSystemPrompt, buildAgentPrompt: coreBuildAgentPrompt } = require('./core/prompt-builder')
const { routeMessage: coreRouteMessage } = require('./core/router')
const { streamAnthropicRaw: coreLlmAnthropicRaw, streamOpenAIRaw: coreLlmOpenAIRaw } = require('./core/llm-raw')
const acpx = require('./core/acpx')

// Legacy globals - kept for backward compat, synced to state via syncState()
let mainWindow
let clawDir = null
let currentSessionId = null
let currentAgentName = null
let heartbeatTimer = null
let tray = null

function syncState() {
  state.mainWindow = mainWindow
  state.clawDir = clawDir
  state.currentSessionId = currentSessionId
  state.currentAgentName = currentAgentName
  state.heartbeatTimer = heartbeatTimer
  state.tray = tray
}
let memoryWatcher = null
let _sessionExpiry = null

// ── Notification helpers (must be before first usage in chat/stream) ──
function pushStatus(win, st, detail) {
  win?.webContents?.send('agent-status', { state: st, detail })
  if (tray) tray.setToolTip(`Paw - ${detail || st}`)
}
function sendNotification(title, body) {
  if (Notification.isSupported()) new Notification({ title, body }).show()
}

// ── Delegated to core/ modules ──
function configPath() { return globalConfigPath(); }
function loadConfig() { return loadGlobalConfig(); }

async function extractLinkContext(text, maxLinks, timeoutMs) { return coreExtractLinkContext(text, maxLinks, timeoutMs); }

const { COMPACT_THRESHOLD_FALLBACK, COMPACT_KEEP_RECENT, estimateTokens, estimateMessagesTokens, compactHistory: coreCompactHistory, getCompactThreshold } = require('./core/compaction')
async function compactHistory(messages, config) {
  const provider = config.provider || 'anthropic'
  const rawFn = provider === 'anthropic' ? streamAnthropicRaw : streamOpenAIRaw
  return coreCompactHistory(messages, config, rawFn)
}

// ── API Key Rotation → delegated to core/api-keys.js ──

function streamAnthropicRaw(messages, system, config) { return coreLlmAnthropicRaw(messages, system, config); }
function streamOpenAIRaw(messages, system, config) { return coreLlmOpenAIRaw(messages, system, config); }

function buildMemoryIndex() { syncState(); return coreBuildMemoryIndex(); }
function startMemoryWatch() { syncState(); coreStartMemoryWatch(); }
function stopMemoryWatch() { coreStopMemoryWatch(); }

// ── Session helpers (SQLite backend) ──
const sessionStore = require('./session-store')

function listSessions(opts) { return sessionStore.listSessions(clawDir, opts) }
function loadSession(id) { return sessionStore.loadSession(clawDir, id) }
function saveSession(session) { sessionStore.saveSession(clawDir, session) }
function createSession(title, opts) { return sessionStore.createSession(clawDir, title, opts) }
function deleteSessionById(id) { sessionStore.deleteSession(clawDir, id) }

function agentsDir() { syncState(); return coreAgentsDir(); }
function listAgents() { syncState(); return coreListAgents(); }
function loadAgent(id) { syncState(); return coreLoadAgent(id); }
function saveAgent(agent) { syncState(); coreSaveAgent(agent); }
function createAgent(name, soul, model) { syncState(); return coreCreateAgent(name, soul, model); }

// ── Tool definitions ──
// All tools come from registry (tools/ directory)
function getAnthropicToolsArray() {
  return getAnthropicTools();
}

// Gate legacy agent/task tools when feature flag is off
const LEGACY_TOOL_NAMES = new Set(['task_create', 'task_update', 'task_list', 'send_message', 'create_agent', 'remove_agent'])
const TOOLS = LEGACY_AGENT_FEATURES
  ? getAnthropicToolsArray()
  : getAnthropicToolsArray().filter(t => !LEGACY_TOOL_NAMES.has(t.name));

// Agent tool filtering: lightweight agents get a subset of tools (legacy)
const AGENT_ALLOWED_TOOLS = new Set([
  'ui_status_set', 'memory_search', 'memory_get',
  'task_create', 'task_update', 'task_list', 'send_message',
]);
function getToolsForAgent() {
  return TOOLS.filter(t => AGENT_ALLOWED_TOOLS.has(t.name));
}

// Auto-assign: find best matching agent for a task title based on role keyword overlap
async function executeTool(name, input, config) {
  // Try registry first for pluggable tools
  const tool = getTool(name);
  if (tool) {
    const context = {
      clawDir,
      sessionId: currentSessionId,
      agentName: currentAgentName,
      mainWindow,
      sessionStore,
      memoryIndex,
      tavilyKey: config?.tavilyKey,
      skillEnv: config?.skillEnv || {},
      sendNotification,
      pushStatus: pushWatsonStatus,
      listAgentsFn: listAgents,
      approvalCallback: async (request) => {
        if (!mainWindow) return false;
        const { dialog } = require('electron');
        const buttons = request.allowRemember
          ? ['Deny', 'Allow Once', 'Always Allow']
          : ['Deny', 'Allow'];
        const result = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Exec Approval',
          message: `AI wants to run a command:`,
          detail: request.command,
          buttons,
          defaultId: 0,
          cancelId: 0,
        });
        if (result.response === 0) return false;
        if (result.response === 2) return 'always';
        return true;
      }
    };
    try {
      return await tool.handler(input, context);
    } catch (error) {
      return `Error executing ${name}: ${error.message}`;
    }
  }

  return `Unknown tool: ${name}`;
}

// Persist directory choices
const PREFS_PATH = path.join(app.getPath('userData'), 'prefs.json')

function loadPrefs() {
  try { return JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8')) } catch { return {} }
}
function savePrefs(p) {
  fs.writeFileSync(PREFS_PATH, JSON.stringify(p, null, 2))
}

// app.disableHardwareAcceleration() - removed: conflicts with hiddenInset rendering

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960, height: 700,
    minWidth: 640, minHeight: 400,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    vibrancy: 'sidebar',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow.loadFile('renderer/index.html')
  mainWindow.webContents.on('console-message', (_, level, msg) => {
    console.log(`[renderer ${level}] ${msg}`)
  })
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.focus()
  })
}

app.whenReady().then(() => {
  // Initialize acpx
  acpx.init()

  // Initialize workspace registry
  workspaceRegistry.initRegistry(app.getPath('userData'))

  // Support --claw-dir CLI arg
  const clawDirArg = process.argv.find(a => a.startsWith('--claw-dir='))
  if (clawDirArg) {
    clawDir = clawDirArg.split('=')[1]
  } else {
    const prefs = loadPrefs()
    clawDir = prefs.clawDir || null
  }
  if (clawDir) {
    startMemoryWatch()
    // Auto-register current workspace if not already
    workspaceRegistry.addWorkspace(clawDir)
  }

  // App menu with New Window
  const template = [
    { role: 'appMenu' },
    { label: 'File', submenu: [
      { label: 'New Window…', accelerator: 'CmdOrCtrl+Shift+N', click: openNewWindow },
      { type: 'separator' },
      { role: 'close' },
    ]},
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  createWindow()

  // Tray icon - AI Native menubar presence
  const trayIconPath = path.join(__dirname, 'assets', 'trayTemplate.png')
  let trayIcon
  if (fs.existsSync(trayIconPath)) {
    trayIcon = nativeImage.createFromPath(trayIconPath)
    trayIcon.setTemplateImage(true)
  } else {
    trayIcon = nativeImage.createEmpty()
  }
  tray = new Tray(trayIcon)
  tray.setToolTip('Paw - 空闲待命中')
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus() })
  updateTrayMenu()

  // Sync all globals to core/state after initialization
  syncState()

  // Start heartbeat (default-on)
  startHeartbeat()
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('will-quit', () => { sessionStore.closeDb(); memoryIndex.closeDb(); try { require('./tools/claude-code').ccStop() } catch {} })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

async function openNewWindow() {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Choose claw directory' })
  if (result.canceled || !result.filePaths[0]) return
  const electronPath = process.argv[0]
  const appPath = app.getAppPath()
  spawn(electronPath, [appPath, `--claw-dir=${result.filePaths[0]}`], { detached: true, stdio: 'ignore' }).unref()
}

// ── IPC: Directory selection ──

ipcMain.handle('get-prefs', () => {
  // Validate clawDir still exists on disk
  if (clawDir && !fs.existsSync(clawDir)) {
    console.log(`[Paw] clawDir gone: ${clawDir}, resetting`)
    stopHeartbeat()
    clawDir = null
    syncState()
    savePrefs({})
  }
  return { clawDir }
})

ipcMain.handle('reset-claw-dir', () => {
  stopHeartbeat()
  stopMemoryWatch()
  clawDir = null
  syncState()
  savePrefs({})
  return true
})

ipcMain.handle('create-claw-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose location for new Claw directory',
  })
  if (result.canceled || !result.filePaths[0]) return null
  const dir = result.filePaths[0]

  // Scaffold from templates/
  const pawDir = path.join(dir, '.paw')
  fs.mkdirSync(pawDir, { recursive: true })
  const templatesDir = path.join(__dirname, 'templates')
  if (fs.existsSync(templatesDir)) {
    for (const f of fs.readdirSync(templatesDir)) {
      const dest = path.join(dir, f)
      if (!fs.existsSync(dest)) fs.copyFileSync(path.join(templatesDir, f), dest)
    }
  }
  for (const d of ['skills', 'memory', 'agents']) {
    const p = path.join(dir, d)
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
  }

  clawDir = dir
  syncState()
  savePrefs({ clawDir })

  startMemoryWatch()
  buildMemoryIndex()
  return dir
})

ipcMain.handle('select-claw-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Claw Directory',
  })
  if (!result.canceled && result.filePaths[0]) {
    clawDir = result.filePaths[0]
    syncState()
    savePrefs({ clawDir })
    for (const sub of ['memory', 'agents', 'skills']) {
      const d = path.join(clawDir, sub)
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
    }
    startMemoryWatch()
  
    buildMemoryIndex()
    return clawDir
  }
  return null
})

// ── IPC: Read config.json from data dir ──

ipcMain.handle('get-config', () => loadGlobalConfig())

ipcMain.handle('get-token-usage', (_, sessionId) => {
  if (!clawDir) return { inputTokens: 0, outputTokens: 0 }
  return sessionStore.getTokenUsage(clawDir, sessionId)
})

ipcMain.handle('save-config', (_, config) => saveGlobalConfig(config))

ipcMain.handle('get-coding-agent', () => {
  const config = loadConfig()
  return config.defaultCodingAgent || 'claude'
})

ipcMain.handle('set-coding-agent', (_, agent) => {
  const config = loadGlobalConfig()
  config.defaultCodingAgent = agent
  return saveGlobalConfig(config)
})

// ── IPC: Sessions ──

ipcMain.handle('sessions-list', (_, opts) => listSessions(opts))
ipcMain.handle('session-load', (_, id) => loadSession(id))
ipcMain.handle('session-save', (_, session) => { saveSession(session); return true })
ipcMain.handle('session-create', (_, opts) => {
  if (typeof opts === 'string') return createSession(opts)  // backward compat
  const { title, workspaceId, participants } = opts || {}
  return createSession(title, { workspaceId, participants })
})
ipcMain.handle('session-delete', (_, id) => {
  try { deleteSessionById(id); return true } catch { return false }
})
ipcMain.handle('session-export', (_, id) => {
  const s = loadSession(id)
  if (!s) return null
  let md = `# ${s.title}\n\n`
  for (const m of s.messages) md += `**${m.role === 'user' ? 'You' : 'Assistant'}:**\n${m.content}\n\n---\n\n`
  return md
})

ipcMain.handle('write-export', (_, filename, content) => {
  if (!clawDir) return false
  const exportDir = path.join(clawDir, '.paw', 'exports')
  fs.mkdirSync(exportDir, { recursive: true })
  const p = path.join(exportDir, filename)
  fs.writeFileSync(p, content)
  shell.openPath(exportDir)
  return true
})

// ── IPC: Agents ──

ipcMain.handle('agents-list', () => listAgents())
ipcMain.handle('agent-load', (_, id) => loadAgent(id))
ipcMain.handle('agent-save', (_, agent) => { saveAgent(agent); return true })
ipcMain.handle('agent-create', (_, { name, soul, model }) => createAgent(name, soul, model))
ipcMain.handle('agent-delete', (_, id) => {
  const p = path.join(agentsDir(), `${id}.json`)
  try { fs.unlinkSync(p); return true } catch { return false }
})

// ── IPC: Session members (legacy, gated by LEGACY_AGENT_FEATURES) ──

ipcMain.handle('session-add-member', (_, { sessionId, agentId }) => {
  if (!LEGACY_AGENT_FEATURES) return false
  const s = loadSession(sessionId)
  if (!s) return false
  if (!s.members) s.members = ['user']
  if (!s.members.includes(agentId)) s.members.push(agentId)
  saveSession(s)
  return true
})

ipcMain.handle('session-remove-member', (_, { sessionId, agentId }) => {
  if (!LEGACY_AGENT_FEATURES) return false
  const s = loadSession(sessionId)
  if (!s || !s.members) return false
  s.members = s.members.filter(m => m !== agentId)
  saveSession(s)
  return true
})

// ── IPC: Session Agents (M19: lightweight agents, gated) ──

ipcMain.handle('session-create-agent', (_, { sessionId, name, role }) => {
  if (!LEGACY_AGENT_FEATURES) return null
  if (!clawDir || !sessionId) return null
  const existing = sessionStore.findSessionAgentByName(clawDir, sessionId, name)
  if (existing) return { error: `Agent "${name}" already exists in this session` }
  const agent = sessionStore.createSessionAgent(clawDir, sessionId, { name, role })
  mainWindow?.webContents.send('session-agents-changed', sessionId)
  return agent
})

ipcMain.handle('session-list-agents', (_, sessionId) => {
  if (!LEGACY_AGENT_FEATURES) return []
  if (!clawDir) return []
  return sessionStore.listSessionAgents(clawDir, sessionId)
})

ipcMain.handle('session-delete-agent', (_, agentId) => {
  if (!LEGACY_AGENT_FEATURES) return false
  if (!clawDir) return false
  const result = sessionStore.deleteSessionAgent(clawDir, agentId)
  if (result && currentSessionId) mainWindow?.webContents.send('session-agents-changed', currentSessionId)
  return result
})

// ── IPC: Tasks (legacy, gated) ──
ipcMain.handle('session-tasks', (_, sessionId) => {
  if (!LEGACY_AGENT_FEATURES) return []
  if (!clawDir) return []
  return sessionStore.listTasks(clawDir, sessionId)
})

// ── IPC: Feature flags ──
ipcMain.handle('get-feature-flags', () => ({
  legacyAgentFeatures: LEGACY_AGENT_FEATURES,
}))

// ── IPC: Workspace registry (M32/F162) ──

ipcMain.handle('workspaces-list', () => workspaceRegistry.listWorkspaces())

ipcMain.handle('workspace-add', async (_, wsPath) => {
  if (!wsPath) {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: '选择 Workspace 文件夹' })
    if (result.canceled || !result.filePaths[0]) return { ok: false, error: 'cancelled' }
    wsPath = result.filePaths[0]
  }
  return workspaceRegistry.addWorkspace(wsPath)
})

ipcMain.handle('workspace-remove', (_, id) => workspaceRegistry.removeWorkspace(id))

ipcMain.handle('workspace-create', async (_, { name, parentDir, avatar, description } = {}) => {
  if (!parentDir) {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], title: '选择存放位置' })
    if (result.canceled || !result.filePaths[0]) return { ok: false, error: 'cancelled' }
    parentDir = result.filePaths[0]
  }
  return workspaceRegistry.createWorkspace(parentDir, name, { avatar, description })
})

ipcMain.handle('workspace-update-identity', (_, { id, name, avatar, description }) => {
  return workspaceRegistry.updateWorkspaceIdentity(id, { name, avatar, description })
})

// ── IPC: Build system prompt from directories ──

ipcMain.handle('build-system-prompt', () => buildSystemPrompt())

ipcMain.handle('open-claw-dir', () => {
  if (clawDir) shell.openPath(clawDir)
})

ipcMain.handle('open-file', (_, filePath) => {
  const p = path.resolve(clawDir || '', filePath)
  shell.openPath(p)
})

// Open image/video/markdown in a new Electron window
ipcMain.handle('open-file-preview', (_, filePath) => {
  const p = path.resolve(clawDir || '', filePath)
  if (!fs.existsSync(p)) return
  const ext = path.extname(p).toLowerCase().slice(1)
  const imgExts = ['png','jpg','jpeg','gif','webp','svg']
  const vidExts = ['mp4','mov','webm','mkv','avi']
  const mdExts = ['md','markdown']

  const win = new BrowserWindow({
    width: 800, height: 600,
    title: path.basename(p),
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })

  if (imgExts.includes(ext)) {
    win.loadURL(`data:text/html,<html><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh"><img src="file://${encodeURI(p)}" style="max-width:100%;max-height:100%;object-fit:contain"></body></html>`)
  } else if (vidExts.includes(ext)) {
    win.loadURL(`data:text/html,<html><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh"><video src="file://${encodeURI(p)}" controls autoplay style="max-width:100%;max-height:100%"></video></body></html>`)
  } else if (mdExts.includes(ext)) {
    const content = fs.readFileSync(p, 'utf8').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    win.loadURL(`data:text/html,<html><head><style>body{margin:20px;background:#1a1a1a;color:#e0e0e0;font-family:system-ui;line-height:1.6;max-width:800px;margin:20px auto}pre{background:#111;padding:12px;border-radius:6px;overflow-x:auto}code{background:#222;padding:2px 4px;border-radius:3px}</style></head><body><pre>${content}</pre></body></html>`)
  }
})

ipcMain.handle('open-external', (_, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url)
  }
})

ipcMain.handle('read-file', (_, filePath) => {
  const p = path.resolve(clawDir || '', filePath)
  try { return fs.readFileSync(p, 'utf8') } catch { return null }
})

// ── IPC: Chat with LLM ──

// Current active requestId - renderer calls chat-prepare to get a unique ID
ipcMain.handle('chat-prepare', () => {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
})

ipcMain.handle('chat', async (_, { prompt, history, rawMessages, agentId, files, sessionId, requestId: paramRequestId, focus }) => {
  const requestId = paramRequestId || Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  // Sync sessionId from renderer
  if (sessionId) { currentSessionId = sessionId; syncState() }
  const config = (() => {
    const p = configPath()
    if (!p) return {}
    try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return {} }
  })()

  // Session auto-expiry check (OpenClaw-aligned)
  if (!_sessionExpiry) {
    _sessionExpiry = new SessionExpiry({
      dailyResetHour: config.dailyResetHour ?? 4,
      idleMinutes: config.idleMinutes ?? 180,
    })
  }
  const expiryReason = _sessionExpiry.shouldReset()
  if (expiryReason && mainWindow) {
    console.log(`[Paw] Session expired: ${expiryReason}`)
    _sessionExpiry.reset()
    mainWindow.webContents.send('session-expired', { reason: expiryReason })
  }
  _sessionExpiry.touch()

  // Resolve agent: lightweight (session-level, legacy) or template (agents/ directory)
  let agent = null
  let isLightweight = false
  if (LEGACY_AGENT_FEATURES && agentId && agentId.startsWith('a') && clawDir && currentSessionId) {
    // Try lightweight agent first
    const sessionAgent = sessionStore.getSessionAgent(clawDir, agentId)
    if (sessionAgent) {
      agent = { id: sessionAgent.id, name: sessionAgent.name, role: sessionAgent.role }
      isLightweight = true
    }
  }
  if (!agent && agentId) {
    agent = loadAgent(agentId)
  }
  currentAgentName = agent?.name || null
  const provider = config.provider || 'anthropic'
  const apiKey = config.apiKey
  const baseUrl = config.baseUrl
  const model = agent?.model || config.model
  if (!apiKey) throw new Error('No API key configured. Click ⚙️ to set up.')

  // Build system prompt + select tools
  let systemPrompt
  let chatTools = TOOLS
  if (isLightweight && agent?.role) {
    // Lightweight agent: compact prompt, filtered tools
    const sessionAgents = sessionStore.listSessionAgents(clawDir, currentSessionId) || []
    systemPrompt = coreBuildAgentPrompt(agent, focus || '', sessionAgents)
    chatTools = getToolsForAgent()
  } else {
    systemPrompt = await buildSystemPrompt()
    if (agent?.soul) {
      // Template agent: soul takes priority
      systemPrompt = agent.soul + '\n\n---\n\n' + systemPrompt
    }
  }

  // F046: Inject other agents' recent messages for visibility
  if (agent && currentSessionId && clawDir) {
    try {
      const session = sessionStore.loadSession(clawDir, currentSessionId)
      if (session?.messages?.length) {
        const otherMsgs = session.messages
          .filter(m => m.role === 'assistant' && m.sender && m.sender !== agent.name)
          .slice(-10)
          .map(m => `[Teammate ${m.sender}]: ${(m.content || '').slice(0, 200)}`)
        if (otherMsgs.length) {
          systemPrompt += '\n\n---\n\n## Teammate Context\n' + otherMsgs.join('\n')
        }
      }
    } catch {}
  }

  // Build messages — rawMessages (pre-filtered independent context) takes priority
  const messages = []
  if (rawMessages?.length) {
    messages.push(...rawMessages)
  } else if (history?.length) {
    for (const h of history) {
      messages.push({ role: 'user', content: h.prompt })
      if (h.answer && h.answer.trim()) {
        messages.push({ role: 'assistant', content: h.answer })
      }
    }
  }
  // Build user content (text + image attachments)
  const userContent = []
  if (files?.length) {
    for (const f of files) {
      if (f.type.startsWith('image/')) {
        const base64 = f.data.replace(/^data:[^;]+;base64,/, '')
        userContent.push({ type: 'image', source: { type: 'base64', media_type: f.type, data: base64 } })
      }
    }
  }
  // Link understanding - async fetch link summaries (non-blocking)
  let linkContext = ''
  try { linkContext = await extractLinkContext(prompt) } catch {}
  const textWithContext = linkContext ? `${prompt}\n\n---\n[Auto-fetched link context]\n${linkContext}` : prompt
  userContent.push({ type: 'text', text: textWithContext || '(attached files)' })
  messages.push({ role: 'user', content: userContent })

  // Session pruning — trim old tool results before token counting (cache-TTL aware)
  const prunedMessages = pruneToolResults(messages, { lastCallTime: _lastAnthropicCallTime, provider })

  // Context compaction - auto-compress if history too long (model-aware threshold)
  const compactThreshold = getCompactThreshold(model)
  const totalTokens = estimateMessagesTokens(prunedMessages)
  let finalMessages = prunedMessages
  let compacted = false
  if (totalTokens > compactThreshold && prunedMessages.length > COMPACT_KEEP_RECENT * 2 + 2) {
    console.log(`[compaction] ${totalTokens} tokens exceeds threshold ${compactThreshold} (model: ${model}), compacting...`)
    mainWindow?.webContents.send('chat-status', { text: '压缩历史对话...', requestId })
    finalMessages = await compactHistory(prunedMessages, { apiKey, baseUrl, model, provider })
    compacted = true
  }

  // Model fallback list with cooldown management
  const fallbacks = config.fallbackModels || []
  const modelsToTry = [{ model, provider }, ...fallbacks.map(f => {
    const p = f.includes('/') ? f.split('/')[0] : provider
    const m = f.includes('/') ? f.split('/').slice(1).join('/') : f
    return { model: m, provider: p }
  })].filter(t => failoverManager.isAvailable(t.model))

  // If all models are in cooldown, try the primary anyway
  if (modelsToTry.length === 0) {
    modelsToTry.push({ model, provider })
  }

  let lastError = null
  for (const target of modelsToTry) {
    try {
      console.log(`[Paw] chat handler: provider=${target.provider} model=${target.model} msgs=${finalMessages.length} tools=${chatTools.length} reqId=${requestId}`)
      let result
      const streamConfig = { apiKey, baseUrl, model: target.model, tavilyKey: config.tavilyKey, maxToolRounds: config.maxToolRounds, maxTokens: config.maxTokens }
      if (target.provider === 'anthropic') {
        result = await streamAnthropic(finalMessages, systemPrompt, streamConfig, mainWindow, requestId, chatTools)
        _lastAnthropicCallTime = Date.now()
      } else {
        result = await streamOpenAI(finalMessages, systemPrompt, streamConfig, mainWindow, requestId, chatTools)
      }
      // Track token usage
      if (result?.usage && sessionId) {
        sessionStore.addTokenUsage(clawDir, sessionId, result.usage.inputTokens, result.usage.outputTokens)
      }
      return result
    } catch (err) {
      lastError = err
      // Record failure with cooldown
      const cd = failoverManager.recordFailure(target.model, err.message)
      console.warn(`[Paw] model ${target.model} failed: ${err.message} (cooldown ${Math.round((cd.until - Date.now()) / 1000)}s, errors: ${cd.errorCount})`)
      if (target === modelsToTry[modelsToTry.length - 1]) {
        console.error('[Paw] all models failed:', err.message)
        pushStatus(mainWindow, 'error', err.message.slice(0, 80))
        throw err
      }
    }
  }
})

// ── IPC: Route message to determine respondents (legacy, gated) ──
ipcMain.handle('chat-route', async (_, { prompt, history, sessionId }) => {
  if (!LEGACY_AGENT_FEATURES) return { respondents: [{ name: 'Main', focus: '' }] }
  if (!clawDir) return { respondents: [{ name: 'Main', focus: '' }] }
  if (sessionId) { currentSessionId = sessionId; syncState() }
  const config = (() => {
    const p = configPath()
    if (!p) return {}
    try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return {} }
  })()
  if (!config.apiKey) return { respondents: [{ name: 'Main', focus: '' }] }
  const sessionAgents = sessionStore.listSessionAgents(clawDir, sessionId) || []
  if (!sessionAgents.length) return { respondents: [{ name: 'Main', focus: '' }] }
  const respondents = await coreRouteMessage(prompt, sessionAgents, history, config)
  return { respondents }
})

// Helper: reuse build-system-prompt logic (workspace-aware via F167)
async function buildSystemPrompt() {
  syncState()
  // Resolve workspace path for current session
  const wsPath = getSessionWorkspacePath()
  return coreBuildSystemPrompt(wsPath)
}

function getSessionWorkspacePath() {
  if (!currentSessionId || !clawDir) return null
  try {
    const participants = sessionStore.getSessionParticipants(clawDir, currentSessionId)
    if (participants.length > 0) {
      const wsObj = workspaceRegistry.getWorkspace(participants[0])
      if (wsObj?.path) return wsObj.path
    }
  } catch {}
  return null  // fallback to default clawDir in prompt-builder
}

// ── Anthropic Streaming ──

async function streamAnthropic(messages, systemPrompt, config, win, requestId, tools) {
  _activeRequestId = requestId
  _activeAbortController = new AbortController()
  // Agent timeout — prevent infinite waits (OpenClaw default: 600s)
  const timeoutMs = (config.timeoutSeconds || 600) * 1000
  const timeoutId = setTimeout(() => {
    console.warn(`[Paw] Agent timeout after ${config.timeoutSeconds || 600}s`)
    _activeAbortController?.abort(new Error('Agent timeout'))
    win?.webContents?.send('chat-status', { text: '超时', requestId })
  }, timeoutMs)
  const activeTools = tools || TOOLS
  const base = (config.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')
  const endpoint = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`
  const headers = { 'Content-Type': 'application/json', 'x-api-key': getApiKey(config), 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31' }
  let fullText = '', roundText = '', msgs = [...messages]

  // Transcript sanitization before streaming (OpenClaw-aligned)
  const cfg = config || {}
  msgs = sanitizeTranscript(msgs, {
    historyLimit: cfg.historyLimit,
    provider: 'anthropic',
    removeTrailingUser: false,
  })
  const loopDetector = new LoopDetector()

  // Usage accumulator — tracks across all rounds (OpenClaw-aligned)
  let totalUsageInput = 0, totalUsageOutput = 0
  let totalCacheRead = 0, totalCacheWrite = 0
  let lastUsageInput = 0, lastCacheRead = 0, lastCacheWrite = 0

  // OpenClaw-aligned: no hard round limit. Loop detection + timeout guard against stuck loops.
  for (let round = 0; ; round++) {
    roundText = ''
    if (round > 0) win.webContents.send('chat-text-start', { requestId })
    pushStatus(win, 'thinking', 'Thinking...')

    // Build system with cache_control for prompt caching
    const scrubbedSystemPrompt = scrubMagicStrings(systemPrompt)
    const systemContent = scrubbedSystemPrompt ? [
      { type: 'text', text: scrubbedSystemPrompt, cache_control: { type: 'ephemeral' } }
    ] : undefined

    // Mark last tool with cache_control for tool schema caching
    const cachedTools = activeTools.map((t, i) =>
      i === activeTools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t
    )

    // Mark last user message with cache_control for conversation caching
    // Scrub magic strings from user messages before sending
    const scrubbedMsgs = msgs.map(m => {
      if (m.role === 'user' && typeof m.content === 'string') {
        return { ...m, content: scrubMagicStrings(m.content) }
      }
      return m
    })
    const cachedMsgs = scrubbedMsgs.map((m, i) => {
      if (i === msgs.length - 1 && m.role === 'user') {
        if (typeof m.content === 'string') {
          return { ...m, content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] }
        }
        if (Array.isArray(m.content)) {
          const last = m.content.length - 1
          const newContent = m.content.map((c, j) =>
            j === last ? { ...c, cache_control: { type: 'ephemeral' } } : c
          )
          return { ...m, content: newContent }
        }
      }
      return m
    })

    // Context window guard — enforce budget before API call
    const contextWindowTokens = resolveContextWindow(config)
    enforceContextBudget(cachedMsgs, contextWindowTokens)

    const body = {
      model: config.model || 'claude-sonnet-4-20250514',
      max_tokens: config.maxTokens || 4096, stream: true,
      system: systemContent,
      messages: cachedMsgs, tools: cachedTools,
    }
    console.log(`[Paw] streamAnthropic round=${round} endpoint=${endpoint} model=${body.model} msgCount=${msgs.length} toolCount=${activeTools.length}`)
    const res = await fetchWithRetry(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: _activeAbortController?.signal })
    console.log(`[Paw] streamAnthropic response status=${res.status}`)
    if (!res.ok) {
      const errText = await res.text()
      const err = new Error(`Anthropic API ${res.status}: ${errText}`)
      err.status = res.status
      err.body = errText
      // Context overflow detection — auto-compact and retry
      if (isContextOverflowError(res.status, errText)) {
        console.warn('[Paw] Context overflow detected, attempting compaction...')
        win.webContents.send('chat-status', { text: '上下文溢出，压缩中...', requestId })
        const compactResult = await compactHistory(msgs, { apiKey: getApiKey(config), baseUrl: config.baseUrl, model: config.model, provider: 'anthropic' })
        if (compactResult.length < msgs.length) {
          msgs.splice(0, msgs.length, ...compactResult)
          round-- // Retry this round
          continue
        }
      }
      throw err
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = '', toolCalls = [], curBlock = null
    let roundUsageInput = 0, roundUsageOutput = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n'); buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const evt = JSON.parse(line.slice(6))
          // Track token usage (including cache stats)
          if (evt.type === 'message_start' && evt.message?.usage) {
            roundUsageInput += evt.message.usage.input_tokens || 0
            // Anthropic cache fields
            if (evt.message.usage.cache_read_input_tokens) totalCacheRead += evt.message.usage.cache_read_input_tokens
            if (evt.message.usage.cache_creation_input_tokens) totalCacheWrite += evt.message.usage.cache_creation_input_tokens
            lastCacheRead = evt.message.usage.cache_read_input_tokens || 0
            lastCacheWrite = evt.message.usage.cache_creation_input_tokens || 0
          }
          if (evt.type === 'message_delta' && evt.usage) {
            roundUsageOutput += evt.usage.output_tokens || 0
          }
          if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
            curBlock = { id: evt.content_block.id, name: evt.content_block.name, json: '' }
          } else if (evt.type === 'content_block_delta') {
            if (evt.delta?.text && !curBlock) { roundText += evt.delta.text; fullText += evt.delta.text; win.webContents.send('chat-token', { requestId, text: evt.delta.text }) }
            if (evt.delta?.partial_json && curBlock) curBlock.json += evt.delta.partial_json
          } else if (evt.type === 'content_block_stop' && curBlock) {
            toolCalls.push(curBlock); curBlock = null
          }
        } catch {}
      }
    }

    // Accumulate usage across rounds
    totalUsageInput += roundUsageInput
    totalUsageOutput += roundUsageOutput
    lastUsageInput = roundUsageInput

    if (!toolCalls.length) {
      pushStatus(win, 'done', 'Done')
      console.log('[Paw] streamAnthropic done, fullText length:', fullText.length)
      clearTimeout(timeoutId)
      return { answer: fullText, usage: { inputTokens: totalUsageInput, outputTokens: totalUsageOutput, cacheRead: totalCacheRead, cacheWrite: totalCacheWrite, lastInputTokens: lastUsageInput, lastCacheRead, lastCacheWrite } }
    }

    // Execute tools and continue
    const assistantContent = []
    if (roundText) assistantContent.push({ type: 'text', text: roundText })
    for (const tc of toolCalls) assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: JSON.parse(tc.json || '{}') })
    msgs.push({ role: 'assistant', content: assistantContent })

    const SILENT_TOOLS = ['ui_status_set', 'notify']
    const toolResults = []
    let loopBlocked = false
    for (const tc of toolCalls) {
      const input = JSON.parse(tc.json || '{}')
      // Loop detection (three-level: warning → critical → circuit-breaker)
      const loopCheck = loopDetector.check(tc.name, input)
      if (loopCheck.blocked) {
        console.warn(`[Paw] ${loopCheck.reason}`)
        toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: loopCheck.reason })
        win.webContents.send('chat-tool-step', { requestId, name: tc.name, output: loopCheck.reason })
        loopBlocked = true
        continue
      }
      if (loopCheck.warning) {
        console.warn(`[Paw] ${loopCheck.reason}`)
      }
      const silent = SILENT_TOOLS.includes(tc.name)
      if (!silent) pushStatus(win, 'tool', `Running ${tc.name}...`)
      const result = await executeTool(tc.name, input, config)
      if (!silent) {
        win.webContents.send('chat-tool-step', { requestId, name: tc.name, output: String(result).slice(0, 500) })
      }
      toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: truncateToolResult(result) })
    }
    // Send round info to renderer
    if (toolCalls.length > 0) {
      win.webContents.send('chat-round-info', { requestId, round: round + 1 })
    }
    msgs.push({ role: 'user', content: toolResults })
    fullText += '\n'
    win.webContents.send('chat-token', { requestId, text: '\n' })
  }
}

// ── OpenAI Streaming ──

async function streamOpenAI(messages, systemPrompt, config, win, requestId, tools) {
  _activeRequestId = requestId
  _activeAbortController = new AbortController()
  // Agent timeout
  const timeoutMs = (config.timeoutSeconds || 600) * 1000
  const timeoutId = setTimeout(() => {
    console.warn(`[Paw] Agent timeout after ${config.timeoutSeconds || 600}s`)
    _activeAbortController?.abort(new Error('Agent timeout'))
    win?.webContents?.send('chat-status', { text: '超时', requestId })
  }, timeoutMs)
  const activeTools = tools || TOOLS
  const base = (config.baseUrl || 'https://api.openai.com').replace(/\/+$/, '')
  const endpoint = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`

  // Convert tools to OpenAI function calling format
  const oaiTools = activeTools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema }
  }))

  const msgs = []
  if (systemPrompt) msgs.push({ role: 'system', content: scrubMagicStrings(systemPrompt) })

  // Sanitize transcript before adding to msgs (OpenClaw-aligned)
  const sanitizedHistory = sanitizeTranscript([...messages], {
    historyLimit: config?.historyLimit,
    provider: (config?.provider || 'openai'),
    removeTrailingUser: false,
  })
  msgs.push(...sanitizedHistory)

  let fullText = '', roundText = ''
  const loopDetector = new LoopDetector()
  // Usage accumulator — tracks across all rounds (OpenClaw-aligned)
  let totalUsageInput = 0, totalUsageOutput = 0

  // OpenClaw-aligned: no hard round limit
  for (let round = 0; ; round++) {
    roundText = ''
    if (round > 0) win.webContents.send('chat-text-start', { requestId })
    pushStatus(win, 'thinking', 'Thinking...')

    // Context window guard — enforce budget before API call
    const contextWindowTokens = resolveContextWindow(config)
    enforceContextBudget(msgs, contextWindowTokens)

    const res = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getApiKey(config)}` },
      body: JSON.stringify({ model: config.model || 'gpt-4o', messages: msgs, stream: true, stream_options: { include_usage: true }, tools: oaiTools }),
      signal: _activeAbortController?.signal,
    })
    if (!res.ok) {
      const errText = await res.text()
      const err = new Error(`OpenAI API ${res.status}: ${errText}`)
      err.status = res.status
      err.body = errText
      if (isContextOverflowError(res.status, errText)) {
        console.warn('[Paw] Context overflow detected (OpenAI), attempting compaction...')
        win.webContents.send('chat-status', { text: '上下文溢出，压缩中...', requestId })
        const compactResult = await compactHistory(msgs, { apiKey: getApiKey(config), baseUrl: config.baseUrl, model: config.model, provider: config.provider || 'openai' })
        if (compactResult.length < msgs.length) {
          msgs.splice(0, msgs.length, ...compactResult)
          round--
          continue
        }
      }
      throw err
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = '', toolCalls = {}
    let roundUsageInput = 0, roundUsageOutput = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n'); buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
        try {
          const parsed = JSON.parse(line.slice(6))
          // Track usage (OpenAI includes it in the final chunk with stream_options)
          if (parsed.usage) {
            roundUsageInput += parsed.usage.prompt_tokens || 0
            roundUsageOutput += parsed.usage.completion_tokens || 0
          }
          const choice = parsed.choices?.[0]
          const delta = choice?.delta
          if (delta?.content) {
            roundText += delta.content
            fullText += delta.content
            win.webContents.send('chat-token', { requestId, text: delta.content })
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index
              if (!toolCalls[idx]) toolCalls[idx] = { id: '', name: '', args: '' }
              if (tc.id) toolCalls[idx].id = tc.id
              if (tc.function?.name) toolCalls[idx].name = tc.function.name
              if (tc.function?.arguments) toolCalls[idx].args += tc.function.arguments
            }
          }
        } catch {}
      }
    }

    const tcList = Object.values(toolCalls)
    
    // Accumulate usage across rounds
    totalUsageInput += roundUsageInput
    totalUsageOutput += roundUsageOutput
    
    if (!tcList.length || !tcList[0].name) {
      pushStatus(win, 'done', 'Done')
      clearTimeout(timeoutId)
      return { answer: fullText, usage: { inputTokens: totalUsageInput, outputTokens: totalUsageOutput } }
    }

    // Build assistant message with tool_calls
    const assistantMsg = { role: 'assistant', content: roundText || null, tool_calls: tcList.map(tc => ({
      id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.args }
    }))}
    msgs.push(assistantMsg)

    // Execute tools and add results
    const SILENT_TOOLS_OAI = ['ui_status_set', 'notify']
    for (const tc of tcList) {
      let input = {}
      try { input = JSON.parse(tc.args || '{}') } catch {}
      // Loop detection (three-level)
      const loopCheck = loopDetector.check(tc.name, input)
      if (loopCheck.blocked) {
        console.warn(`[Paw] ${loopCheck.reason}`)
        win.webContents.send('chat-tool-step', { requestId, name: tc.name, output: loopCheck.reason })
        msgs.push({ role: 'tool', tool_call_id: tc.id, content: loopCheck.reason })
        continue
      }
      if (loopCheck.warning) {
        console.warn(`[Paw] ${loopCheck.reason}`)
      }
      const silent = SILENT_TOOLS_OAI.includes(tc.name)
      if (!silent) pushStatus(win, 'tool', `Running ${tc.name}...`)
      const result = await executeTool(tc.name, input, config)
      if (!silent) {
        win.webContents.send('chat-tool-step', { requestId, name: tc.name, output: String(result).slice(0, 500) })
      }
      msgs.push({ role: 'tool', tool_call_id: tc.id, content: truncateToolResult(result) })
    }
    // Send round info to renderer
    if (tcList.length > 0) {
      win.webContents.send('chat-round-info', { requestId, round: round + 1 })
    }
    fullText += '\n'
    win.webContents.send('chat-token', { requestId, text: '\n' })
  }
}

// ── M8-01: Heartbeat ──

function startHeartbeat() {
  stopHeartbeat()
  if (!clawDir) return
  let cfg; try { cfg = JSON.parse(fs.readFileSync(configPath(), 'utf8')) } catch { return }
  if (cfg.heartbeat?.enabled === false) return
  const hb = cfg.heartbeat || {}
  const ms = (hb.intervalMinutes || 30) * 60000
  let prompt = hb.prompt || 'Heartbeat: check if anything needs attention. Reply HEARTBEAT_OK if nothing.'
  // Append HEARTBEAT.md if present
  if (clawDir) {
    const hbPath = path.join(clawDir, 'HEARTBEAT.md')
    if (fs.existsSync(hbPath)) {
      try { prompt += '\n\n' + fs.readFileSync(hbPath, 'utf8') } catch {}
    }
  }
  heartbeatTimer = setInterval(async () => {
    try {
      const c = JSON.parse(fs.readFileSync(configPath(), 'utf8'))
      if (!c.apiKey) return
      const sp = await buildSystemPrompt()
      const msgs = [{ role: 'user', content: prompt }]
      const fn = (c.provider || 'anthropic') === 'anthropic' ? streamAnthropic : streamOpenAI
      // Use a dedicated heartbeat requestId to avoid hijacking active user chats
      const hbRequestId = 'hb-' + Date.now().toString(36)
      const r = await fn(msgs, sp, c, mainWindow, hbRequestId)
      if (r?.answer && !r.answer.includes('HEARTBEAT_OK')) {
        sendNotification('Paw', r.answer.slice(0, 200))
        mainWindow?.webContents.send('heartbeat-result', r.answer)
      }
    } catch (e) { console.error('Heartbeat error:', e.message) }
  }, ms)
}
function stopHeartbeat() { if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null } }
ipcMain.handle('heartbeat-start', () => { startHeartbeat(); return true })
ipcMain.handle('heartbeat-stop', () => { stopHeartbeat(); return true })

// ── M8-04: Notification (moved to top, see line ~126) ──

// ── Tray Menu (AI Native) ──
let _trayStatusText = '空闲待命中'
let _trayStatusLevel = 'idle'

function updateTrayMenu() {
  if (!tray) return
  const statusEmoji = { idle: '⚪', thinking: '🟡', running: '🔵', need_you: '🔴', done: '🟢' }
  const emoji = statusEmoji[_trayStatusLevel] || '⚪'
  const menu = Menu.buildFromTemplate([
    { label: `${emoji}  ${_trayStatusText}`, enabled: false },
    { type: 'separator' },
    { label: '打开 Paw', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { label: '新建对话', click: () => { mainWindow?.show(); mainWindow?.webContents?.send('tray-new-chat') } },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ])
  tray.setContextMenu(menu)
}

// requestId is optional - when provided, renderer routes to per-card status

ipcMain.handle('chat-cancel', () => {
  if (_activeAbortController) {
    _activeAbortController.abort()
    _activeAbortController = null
    return true
  }
  return false
})

function pushWatsonStatus(level, text, requestId) {
  const rid = requestId || _activeRequestId
  const payload = { level, text, requestId: rid }
  mainWindow?.webContents?.send('watson-status', payload)
  // Persist status to SQLite
  if (currentSessionId && clawDir) {
    try { sessionStore.updateSessionStatus(clawDir, currentSessionId, level, text) } catch {}
  }
  // Update tray
  _trayStatusText = text || '空闲待命中'
  _trayStatusLevel = level || 'idle'
  if (tray) {
    tray.setToolTip(`Paw - ${_trayStatusText}`)
    // macOS: set tray title to show status text next to icon
    tray.setTitle(level === 'idle' ? '' : text)
    updateTrayMenu()
  }
  if (level === 'done') setTimeout(() => {
    pushWatsonStatus('idle', '空闲待命中', null)
  }, 2000)
}

ipcMain.handle('notify', (_, { title, body }) => { sendNotification(title, body); return true })

ipcMain.handle('update-session-status', (_, { sessionId, level, text }) => {
  if (clawDir && sessionId) {
    try { sessionStore.updateSessionStatus(clawDir, sessionId, level, text) } catch {}
  }
  return true
})

ipcMain.handle('cc-stop', () => {
  try { require('./tools/claude-code').ccStop() } catch {}
  return true
})
