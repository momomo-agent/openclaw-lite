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
const eventBus = require('./core/event-bus')
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

// ── Helper functions (must be defined early) ──
let _activeRequestId = null
let _activeAbortController = null
let _activeCodingProcess = null
// Per-request delegate message accumulator — saved in correct order by finishChat
const _pendingDelegateMessages = new Map() // requestId → [{sender, content, toolSteps, senderWorkspaceId, timestamp}]

function pushStatus(st, detail) {
  eventBus.dispatch('agent-status', { state: st, detail })
  if (tray) tray.setToolTip(`Paw - ${detail || st}`)
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
const { startHeartbeat: coreStartHeartbeat, stopHeartbeat: coreStopHeartbeat, startHeartbeatCron, stopHeartbeatCron } = require('./core/heartbeat')
const { McpManager } = require('./core/mcp-client')
const { CronService } = require('./core/cron')
const { updateTrayMenu: coreUpdateTrayMenu } = require('./core/tray')
const { buildMemoryIndex: coreBuildMemoryIndex, startMemoryWatch: coreStartMemoryWatch, stopMemoryWatch: coreStopMemoryWatch } = require('./core/memory-watch')
const { buildSystemPrompt: coreBuildSystemPrompt } = require('./core/prompt-builder')
const { routeMessage: coreRouteMessage } = require('./core/router')
const { streamAnthropicRaw: coreLlmAnthropicRaw, streamOpenAIRaw: coreLlmOpenAIRaw } = require('./core/llm-raw')
const acpx = require('./core/acpx')
const codingAgents = require('./core/coding-agents')
const codingAgentRegistry = require('./core/coding-agent-registry')

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
const mcpManager = new McpManager()
let cronService = null

// ── Notification helpers (must be before first usage in chat/stream) ──
// pushStatus already defined above (uses eventBus)
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

function getSessionWorkspace(sessionId) {
  const workspaces = workspaceRegistry.listWorkspaces()
  return sessionStore.findSessionWorkspace(workspaces, sessionId)
}

// Resolve the DB path for a session. Always use this instead of clawDir for session ops.
function resolveSessionDb(sessionId) {
  return (sessionId && getSessionWorkspace(sessionId)) || clawDir
}

function listSessions(opts) {
  const workspaces = workspaceRegistry.listWorkspaces()
  return sessionStore.listAllSessions(workspaces, opts)
}

function loadSession(id) {
  const wsPath = getSessionWorkspace(id)
  return wsPath ? sessionStore.loadSession(wsPath, id) : null
}

function saveSession(session) {
  const wsPath = getSessionWorkspace(session.id)
  if (wsPath) sessionStore.saveSession(wsPath, session)
}

function createSession(title, opts) {
  // Resolve target workspace: explicit workspaceId > first participant > active clawDir > first registered
  let targetWsPath = null
  const wsId = opts?.workspaceId || (opts?.participants && opts.participants[0])
  if (wsId) {
    const ws = workspaceRegistry.getWorkspace(wsId)
    if (ws) targetWsPath = ws.path
  }
  if (!targetWsPath) targetWsPath = clawDir || workspaceRegistry.listWorkspaces()[0]?.path
  if (!targetWsPath) return null
  // Auto-populate participants from workspaceId if not explicitly provided
  if (opts?.workspaceId && (!opts.participants || opts.participants.length === 0)) {
    opts = { ...opts, participants: [opts.workspaceId] }
  }
  return sessionStore.createSession(targetWsPath, title, opts)
}

function deleteSessionById(id) {
  const wsPath = getSessionWorkspace(id)
  if (wsPath) sessionStore.deleteSession(wsPath, id)
}

function agentsDir() { syncState(); return coreAgentsDir(); }
function listAgents() { syncState(); return coreListAgents(); }
function loadAgent(id) { syncState(); return coreLoadAgent(id); }
function saveAgent(agent) { syncState(); coreSaveAgent(agent); }
function createAgent(name, soul, model) { syncState(); return coreCreateAgent(name, soul, model); }

// ── Tool definitions ──
// All tools come from registry (tools/ directory) + MCP tools
const LEGACY_TOOL_NAMES = new Set(['send_message', 'create_agent', 'remove_agent'])

function getToolsWithMcp() {
  let tools = getAnthropicTools().filter(t => !LEGACY_TOOL_NAMES.has(t.name));
  // Merge MCP tools
  const mcpTools = mcpManager.listTools();
  if (mcpTools.length > 0) {
    tools = tools.concat(mcpTools);
  }
  return tools;
}
// Legacy compat: TOOLS now calls the function
const TOOLS_PROXY = { get tools() { return getToolsWithMcp(); } };
const TOOLS = getToolsWithMcp();  // Initial snapshot for module-load-time references

// Group chat tools (injected dynamically for group owner)
const DELEGATE_TO_TOOL = {
  name: 'delegate_to',
  description: 'Route the user\'s message to another participant. They will respond directly to the user in their own voice.',
  input_schema: {
    type: 'object',
    properties: {
      participant_name: { type: 'string', description: 'Name of the participant to delegate to' },
      message: { type: 'string', description: 'The message to pass (include the user\'s original intent)' },
    },
    required: ['participant_name', 'message'],
  },
};
const STAY_SILENT_TOOL = {
  name: 'stay_silent',
  description: 'Stay silent — do not produce any visible response. Use this after delegate_to when you have nothing to add.',
  input_schema: { type: 'object', properties: {}, required: [] },
};

// Auto-assign: find best matching agent for a task title based on role keyword overlap
async function executeTool(name, input, config, { sessionId: _sid, agentName: _aname } = {}) {
  const sid = _sid || currentSessionId
  const aname = _aname || currentAgentName
  // ── Group chat tools ──
  if (name === 'delegate_to') {
    return await handleDelegateTo(input, config, sid)
  }
  if (name === 'stay_silent') {
    return 'OK'
  }

  // MCP tools: mcp__ prefix → route to MCP manager
  if (mcpManager.isMcpTool(name)) {
    try {
      return await mcpManager.callTool(name, input);
    } catch (e) {
      return `MCP error: ${e.message}`;
    }
  }

  // Try registry first for pluggable tools
  const tool = getTool(name);
  if (tool) {
    const toolDb = resolveSessionDb(sid)
    const context = {
      clawDir: toolDb || clawDir,
      sessionId: sid,
      sessionDir: toolDb && sid ? path.join(toolDb, '.paw', 'sessions', sid) : null,
      storeDir: toolDb ? path.join(toolDb, '.paw', 'store') : null,
      agentName: aname,
      mainWindow,
      sessionStore,
      memoryIndex,
      tavilyKey: config?.tavilyKey,
      skillEnv: config?.skillEnv || {},
      sendNotification,
      pushStatus: pushWatsonStatus,
      listAgentsFn: listAgents,
      cronService,
      mcpManager,
      configPath: configPath(),
      loadConfigFn: loadConfig,
      saveConfigFn: (cfg) => { saveGlobalConfig(cfg); },
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
const os = require('os')
const GLOBAL_DIR = path.join(os.homedir(), '.paw')
const PREFS_PATH = path.join(GLOBAL_DIR, 'prefs.json')

function loadPrefs() {
  try { return JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8')) } catch { return {} }
}
function savePrefs(p) {
  const existing = loadPrefs()
  const merged = { ...existing, ...p }
  fs.mkdirSync(GLOBAL_DIR, { recursive: true })
  fs.writeFileSync(PREFS_PATH, JSON.stringify(merged, null, 2))
}

// Seed global USER.md from template if missing
{
  const globalUserMd = path.join(GLOBAL_DIR, 'USER.md')
  if (!fs.existsSync(globalUserMd)) {
    const tpl = path.join(__dirname, 'templates', 'USER.md')
    fs.mkdirSync(GLOBAL_DIR, { recursive: true })
    if (fs.existsSync(tpl)) fs.copyFileSync(tpl, globalUserMd)
  }
}

const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development'

// app.disableHardwareAcceleration() - removed: conflicts with hiddenInset rendering

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960, height: 700,
    minWidth: 640, minHeight: 400,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 21, y: 21 },
    vibrancy: 'sidebar',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !isDev, // Allow file:// in dev for workspace avatars
    },
  })

  // Load from Vite dev server in dev mode, built files in production
  if (isDev) {
    // Wait for Vite to be ready, then load
    const http = require('http')
    const waitForVite = (port, retries = 10) => new Promise((resolve) => {
      const check = (n) => {
        if (n <= 0) return resolve(null)
        const req = http.get(`http://localhost:${port}/src/index.html`, (res) => {
          if (res.statusCode === 200) resolve(port)
          else setTimeout(() => check(n - 1), 500)
        })
        req.on('error', () => setTimeout(() => check(n - 1), 500))
        req.setTimeout(1000, () => { req.destroy(); setTimeout(() => check(n - 1), 500) })
      }
      check(retries)
    })
    // Try ports in order
    const port = await waitForVite(5173) || await waitForVite(5174) || await waitForVite(5175)
    if (port) {
      mainWindow.loadURL(`http://localhost:${port}/src/index.html`)
    } else {
      mainWindow.loadFile('renderer/src/index.html')
    }
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile('renderer/src/index.html')
  }

  mainWindow.webContents.on('console-message', (_, level, msg) => {
    console.log(`[renderer ${level}] ${msg}`)
  })
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.focus()
  })

  // Bridge eventBus → BrowserWindow IPC
  bridgeEventBus(mainWindow)

  // Null out mainWindow reference on close so runtime knows there's no window
  mainWindow.on('closed', () => {
    mainWindow = null
    syncState()
  })
  mainWindow.on('focus', () => {
    _unreadCount = 0
    updateTrayTitle()
  })
}

// ── EventBus → BrowserWindow bridge ──
const EVENT_CHANNELS = [
  'chat-token', 'chat-tool-step', 'chat-round-info', 'chat-text-start',
  'chat-done', 'chat-error', 'chat-status',
  'chat-delegate-start', 'chat-delegate-token', 'chat-delegate-end',
  'agent-status', 'watson-status',
  'session-agents-changed', 'session-expired', 'tasks-changed',
  'heartbeat-result', 'tray-new-chat', 'memory-changed',
  'cc-status', 'cc-output', 'auto-rotate',
]

function bridgeEventBus(win) {
  const handlers = EVENT_CHANNELS.map(ch => {
    const handler = (data) => {
      if (!win.isDestroyed()) win.webContents.send(ch, data)
    }
    eventBus.on(ch, handler)
    return { ch, handler }
  })
  win.on('closed', () => {
    for (const { ch, handler } of handlers) eventBus.off(ch, handler)
  })
}

app.whenReady().then(() => {
  // Initialize acpx + coding agents
  acpx.init()
  codingAgents.init()
  codingAgentRegistry.init()

  // Initialize workspace registry
  workspaceRegistry.initRegistry()

  // Derive clawDir from CLI arg or first registered workspace
  const clawDirArg = process.argv.find(a => a.startsWith('--claw-dir='))
  if (clawDirArg) {
    const argPath = clawDirArg.split('=')[1]
    workspaceRegistry.addWorkspace(argPath)
    clawDir = argPath
  } else {
    const ws = workspaceRegistry.listWorkspaces()
    clawDir = ws.length > 0 ? ws[0].path : null
  }
  if (clawDir) {
    startMemoryWatch()
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

  // Start MCP servers + Cron service
  initMcpAndCron()

  // Start heartbeat (default-on)
  startHeartbeat()
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('will-quit', () => {
  sessionStore.closeDb(); memoryIndex.closeDb();
  try { require('./tools/claude-code').ccStop() } catch {}
  mcpManager.disconnectAll().catch(() => {});
  if (cronService) cronService.stop();
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
    // createWindow already calls bridgeEventBus + sets up closed handler
  }
})

async function openNewWindow() {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Choose claw directory' })
  if (result.canceled || !result.filePaths[0]) return
  const electronPath = process.argv[0]
  const appPath = app.getAppPath()
  spawn(electronPath, [appPath, `--claw-dir=${result.filePaths[0]}`], { detached: true, stdio: 'ignore' }).unref()
}

// ── IPC: Directory selection ──

ipcMain.handle('get-prefs', () => {
  const prefs = loadPrefs()
  return { clawDir, userName: prefs.userName || '', userAvatar: prefs.userAvatar || '' }
})

ipcMain.handle('get-user-profile', () => {
  const prefs = loadPrefs()
  // Ensure user avatar exists — default to preset:0 if missing
  if (!prefs.userAvatar) {
    prefs.userAvatar = 'preset:0'
    savePrefs(prefs)
  }
  const absPath = prefs.userAvatar === 'user-avatar.png' ? path.join(GLOBAL_DIR, 'user-avatar.png') : null
  return { userName: prefs.userName || '', userAvatar: prefs.userAvatar || '', avatarAbsPath: absPath }
})

ipcMain.handle('set-user-profile', (_, { userName, presetIndex, customPath, useCustom }) => {
  const prefs = loadPrefs()
  if (userName !== undefined) prefs.userName = userName
  if (presetIndex !== undefined) {
    prefs.userAvatar = `preset:${presetIndex}`
  } else if (customPath) {
    const dest = path.join(GLOBAL_DIR, 'user-avatar.png')
    fs.mkdirSync(GLOBAL_DIR, { recursive: true })
    try { fs.copyFileSync(customPath, dest) } catch {}
    prefs.userAvatar = 'user-avatar.png'
  } else if (useCustom) {
    prefs.userAvatar = 'user-avatar.png'
  }
  savePrefs(prefs)
  const absPath = prefs.userAvatar === 'user-avatar.png' ? path.join(GLOBAL_DIR, 'user-avatar.png') : null
  return { userName: prefs.userName || '', userAvatar: prefs.userAvatar || '', avatarAbsPath: absPath }
})

ipcMain.handle('get-user-avatar-path', () => {
  return path.join(GLOBAL_DIR, 'user-avatar.png')
})

ipcMain.handle('pick-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
  })
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
})

ipcMain.handle('reset-claw-dir', () => {
  stopHeartbeat()
  stopMemoryWatch()
  clawDir = null
  syncState()
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
  const db = resolveSessionDb(sessionId)
  if (!db) return { inputTokens: 0, outputTokens: 0 }
  return sessionStore.getTokenUsage(db, sessionId)
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

ipcMain.handle('list-coding-agents', () => {
  return codingAgents.listAvailable()
})

// ── IPC: Coding Agent Registry (F206) ──

ipcMain.handle('coding-agents-list', () => {
  const available = codingAgents.listAvailable()
  const registry = codingAgentRegistry.list()
  return { available, registry }
})

ipcMain.handle('coding-agent-add', async (_, { engine, projectPath, name }) => {
  if (!projectPath) {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Select Project Folder' })
    if (result.canceled || !result.filePaths[0]) return { ok: false, error: 'cancelled' }
    projectPath = result.filePaths[0]
  }
  const agent = codingAgentRegistry.add({ engine, projectPath, name })
  return { ok: true, agent }
})

ipcMain.handle('coding-agent-delete', (_, id) => {
  return codingAgentRegistry.remove(id)
})

// ── IPC: Sessions ──

ipcMain.handle('sessions-list', (_, opts) => listSessions(opts))
ipcMain.handle('session-load', (_, id) => loadSession(id))
ipcMain.handle('session-save', (_, session) => { saveSession(session); return true })
ipcMain.handle('session-create', (_, opts) => {
  if (typeof opts === 'string') return createSession(opts)
  const { title, participants, mode, workspaceId } = opts || {}
  return createSession(title, { participants, mode, workspaceId })
})
ipcMain.handle('session-delete', (_, id) => {
  try { deleteSessionById(id); return true } catch { return false }
})
ipcMain.handle('session-rename', (_, id, title) => {
  try {
    const wsPath = getSessionWorkspace(id)
    if (wsPath) sessionStore.renameSession(wsPath, id, title)
    return true
  } catch { return false }
})
ipcMain.handle('message-delete', (_, { sessionId, messageId }) => {
  const wsPath = getSessionWorkspace(sessionId)
  if (wsPath) sessionStore.deleteMessage(wsPath, sessionId, messageId)
  return true
})
ipcMain.handle('message-update-meta', (_, { sessionId, messageId, fields }) => {
  const wsPath = getSessionWorkspace(sessionId)
  if (wsPath) sessionStore.updateMessageMeta(wsPath, sessionId, messageId, fields)
  return true
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
  return false // legacy, disabled
  const s = loadSession(sessionId)
  if (!s) return false
  if (!s.members) s.members = ['user']
  if (!s.members.includes(agentId)) s.members.push(agentId)
  saveSession(s)
  return true
})

ipcMain.handle('session-remove-member', (_, { sessionId, agentId }) => {
  return false // legacy, disabled
  const s = loadSession(sessionId)
  if (!s || !s.members) return false
  s.members = s.members.filter(m => m !== agentId)
  saveSession(s)
  return true
})

// ── IPC: Session Participants (M32 group chat) ──

ipcMain.handle('session-add-participant', (_, { sessionId, workspaceId }) => {
  if (!sessionId || !workspaceId) return false
  const wsPath = getSessionWorkspace(sessionId)
  return wsPath ? sessionStore.addSessionParticipant(wsPath, sessionId, workspaceId) : false
})

ipcMain.handle('session-remove-participant', (_, { sessionId, workspaceId }) => {
  if (!sessionId || !workspaceId) return false
  const wsPath = getSessionWorkspace(sessionId)
  return wsPath ? sessionStore.removeSessionParticipant(wsPath, sessionId, workspaceId) : false
})

ipcMain.handle('session-get-participants', (_, sessionId) => {
  if (!sessionId) return []
  const wsPath = getSessionWorkspace(sessionId)
  return wsPath ? sessionStore.getSessionParticipants(wsPath, sessionId) : []
})

// ── IPC: Session Agents (M19: lightweight agents, gated) ──

ipcMain.handle('session-create-agent', (_, { sessionId, name, role }) => {
  return null // legacy, disabled
  if (!sessionId) return null
  const wsPath = getSessionWorkspace(sessionId)
  if (!wsPath) return null
  const existing = sessionStore.findSessionAgentByName(wsPath, sessionId, name)
  if (existing) return { error: `Agent "${name}" already exists in this session` }
  const agent = sessionStore.createSessionAgent(wsPath, sessionId, { name, role })
  eventBus.dispatch('session-agents-changed', sessionId)
  return agent
})

ipcMain.handle('session-list-agents', (_, sessionId) => {
  return [] // legacy, disabled
  const wsPath = getSessionWorkspace(sessionId)
  return wsPath ? sessionStore.listSessionAgents(wsPath, sessionId) : []
})

ipcMain.handle('session-delete-agent', (_, agentId) => {
  return false // legacy, disabled
  const workspaces = workspaceRegistry.listWorkspaces()
  for (const ws of workspaces) {
    const result = sessionStore.deleteSessionAgent(ws.path, agentId)
    if (result && currentSessionId) {
      eventBus.dispatch('session-agents-changed', currentSessionId)
      return true
    }
  }
  return false
})

// ── IPC: Tasks (file-based) ──
ipcMain.handle('session-tasks', (_, sessionId) => {
  const wsPath = getSessionWorkspace(sessionId)
  if (!wsPath || !sessionId) return []
  const { loadTasks } = require('./tools/tasks')
  const sessionDir = path.join(wsPath, '.paw', 'sessions', sessionId)
  return loadTasks(sessionDir)
})

// ── IPC: Feature flags ──
ipcMain.handle('get-feature-flags', () => ({
  legacyAgentFeatures: false,
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

ipcMain.handle('workspace-set-avatar', async (_, { id, presetIndex, customPath }) => {
  const ws = workspaceRegistry.getWorkspace(id)
  if (!ws) return { ok: false, error: 'not_found' }
  try {
    if (presetIndex !== undefined) {
      return workspaceRegistry.updateWorkspaceIdentity(id, { avatar: `preset:${presetIndex}` })
    } else if (customPath) {
      const dest = path.join(ws.path, '.paw', 'avatar.png')
      fs.mkdirSync(path.join(ws.path, '.paw'), { recursive: true })
      fs.copyFileSync(customPath, dest)
      return workspaceRegistry.updateWorkspaceIdentity(id, { avatar: 'avatar.png' })
    }
    return { ok: false, error: 'no_source' }
  } catch (e) {
    return { ok: false, error: e.message }
  }
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

// ── Chat persistence ──
// User message: saved BEFORE streaming (crash-safe)
// Assistant message + chat-done: saved/dispatched AFTER streaming (guarantees DB before UI)
function persistUserMessage(sessionId, content) {
  const wsPath = sessionId ? (getSessionWorkspace(sessionId) || clawDir) : null
  console.log(`[Paw] persistUserMessage: sessionId=${sessionId} wsPath=${wsPath} clawDir=${clawDir} contentLen=${(content||'').length}`)
  if (wsPath) sessionStore.appendMessage(wsPath, sessionId, { role: 'user', content: content || '', timestamp: Date.now() })
}

function finishChat(sessionId, requestId, assistantText, wsIdentity, toolSteps) {
  const wsPath = sessionId ? (getSessionWorkspace(sessionId) || clawDir) : null
  const isError = assistantText && assistantText.startsWith('❌')
  // Strip NO_REPLY from orchestrator text (delegate already responded directly)
  const saveText = (assistantText || '').replace(/\n?NO_REPLY\s*$/i, '').trim()
  // Gather accumulated delegate messages (always clean up, even on error)
  const delegateMsgs = _pendingDelegateMessages.get(requestId) || []
  _pendingDelegateMessages.delete(requestId)
  console.log(`[Paw] finishChat: sessionId=${sessionId} isError=${isError} textLen=${(assistantText||'').length} saveLen=${saveText.length} steps=${toolSteps?.length || 0} delegates=${delegateMsgs.length}`)

  if (wsPath && !isError) {
    const orchMeta = {}
    if (wsIdentity?.agentName) orchMeta.sender = wsIdentity.agentName
    if (wsIdentity?.workspaceId) orchMeta.senderWorkspaceId = wsIdentity.workspaceId
    const steps = toolSteps || []

    if (delegateMsgs.length > 0) {
      // ── Group chat: split orchestrator toolSteps at delegate_to boundaries ──
      // Save in visual order: orch-segment → delegate → orch-segment → delegate → ...
      // This matches how cards appear during streaming (pendingSplit creates new cards)
      let currentSteps = []
      let delegateIdx = 0
      for (const step of steps) {
        currentSteps.push(step)
        if (step.name === 'delegate_to' && delegateIdx < delegateMsgs.length) {
          // Flush orchestrator segment (thinking + tools + delegate_to call)
          if (currentSteps.length) {
            sessionStore.appendMessage(wsPath, sessionId, {
              role: 'assistant', content: '', timestamp: Date.now(),
              toolSteps: currentSteps, ...orchMeta,
            })
          }
          currentSteps = []
          // Save delegate response
          const dm = delegateMsgs[delegateIdx++]
          const dmMeta = { sender: dm.sender, senderWorkspaceId: dm.senderWorkspaceId }
          if (dm.toolSteps?.length) dmMeta.toolSteps = dm.toolSteps
          sessionStore.appendMessage(wsPath, sessionId, {
            role: 'assistant', content: dm.content, timestamp: dm.timestamp, ...dmMeta,
          })
        }
      }
      // Final orchestrator segment (post-delegation text, if any)
      if (saveText || currentSteps.length) {
        const finalMeta = { ...orchMeta }
        if (currentSteps.length) finalMeta.toolSteps = currentSteps
        sessionStore.appendMessage(wsPath, sessionId, {
          role: 'assistant', content: saveText, timestamp: Date.now(), ...finalMeta,
        })
      }
    } else {
      // ── Simple chat (no delegation) ──
      if (saveText || steps.length) {
        const meta = { ...orchMeta }
        if (steps.length) meta.toolSteps = steps
        sessionStore.appendMessage(wsPath, sessionId, {
          role: 'assistant', content: saveText, timestamp: Date.now(), ...meta,
        })
      }
    }
  }
  eventBus.dispatch('chat-done', { requestId, sessionId, error: isError ? assistantText : undefined })
  // Unread count: increment when window not focused
  if (!isError && mainWindow && !mainWindow.isFocused()) {
    _unreadCount++
    updateTrayTitle()
  }
}

ipcMain.handle('chat', async (_, { prompt, message, history, rawMessages, agentId, files, attachments, sessionId, requestId: paramRequestId, focus, targetWorkspaceId }) => {
  // React sends { message, attachments }, vanilla sends { prompt, files } — support both
  prompt = prompt || message || ''
  files = files || attachments || []
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
  if (expiryReason) {
    console.log(`[Paw] Session expired: ${expiryReason}`)
    _sessionExpiry.reset()
    eventBus.dispatch('session-expired', { reason: expiryReason })
  }
  _sessionExpiry.touch()

  // ── Coding agent routing ──
  // Check session mode or workspace codingAgent config
  const sessionMode = sessionId ? getSessionMode(sessionId) : null
  if (sessionMode === 'coding') {
    const codingAgentId = config.defaultCodingAgent || 'claude'
    if (codingAgents.isAvailable(codingAgentId)) {
      persistUserMessage(sessionId, prompt)
      const wsPath = getSessionWorkspacePath()
      const result = await streamCodingAgent(codingAgentId, prompt, {
        cwd: wsPath || clawDir || process.cwd(),
        sessionId,
        requestId,
      })
      finishChat(sessionId, requestId, result?.answer, null, result?.toolSteps)
      return result
    }
  }

  // Resolve agent: template (agents/ directory)
  let agent = null
  if (agentId) {
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
  let chatTools = getToolsWithMcp()
  systemPrompt = await buildSystemPrompt(targetWorkspaceId || null)
  if (agent?.soul) {
    // Template agent: soul takes priority
    systemPrompt = agent.soul + '\n\n---\n\n' + systemPrompt
  }

  // Inject participant context + group chat orchestrator
  const _sessionDb = resolveSessionDb(sessionId)
  let _isGroupChat = false
  if (sessionId && _sessionDb) {
    try {
      const participants = sessionStore.getSessionParticipants(_sessionDb, sessionId)
      const participantInfos = participants.map(pid => {
        const w = workspaceRegistry.getWorkspace(pid)
        return { id: pid, name: w?.identity?.name || pid, description: w?.identity?.description || '' }
      })
      const ownerWsId = targetWorkspaceId || participants[0]
      const ownerWs = workspaceRegistry.getWorkspace(ownerWsId)
      const myName = ownerWs?.identity?.name || 'Assistant'

      if (participants.length > 1) {
        _isGroupChat = true
        const roster = participantInfos.map(p => `- **${p.name}**${p.description ? ': ' + p.description : ''}`).join('\n')
        systemPrompt += `\n\n---\n\n## Group Chat — You Are the Orchestrator
You are **${myName}**, the owner of this group chat.

### Current Participants (authoritative — ignore historical references to removed members)
${roster}

### Rules
1. **User mentions another participant** → call \`delegate_to\`.
2. **User talks to you or sends a general message** → respond yourself.
3. **After delegate_to** → call \`delegate_to\` again, add genuine context, or call \`stay_silent\`.
4. **Never restate or summarize** what a delegate just said.
5. **Removed members are gone.** Do NOT delegate to or mention them as active.`
        chatTools = [...chatTools, DELEGATE_TO_TOOL, STAY_SILENT_TOOL]
      } else if (participants.length === 1) {
        systemPrompt += `\n\n---\n\nYou are **${myName}**. This is a private conversation between you and the user. No other participants are present.`
      }
    } catch {}
  }

  // F046: Inject other agents' recent messages for visibility
  if (agent && sessionId && _sessionDb) {
    try {
      const session = sessionStore.loadSession(_sessionDb, sessionId)
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
    // Group chat: load from DB to get sender metadata
    const participants = sessionId && _sessionDb ? sessionStore.getSessionParticipants(_sessionDb, sessionId) : []
    const isGroupChat = participants.length > 1
    if (isGroupChat && sessionId && _sessionDb) {
      // Load full session to get sender info per message
      const fullSession = sessionStore.loadSession(_sessionDb, sessionId)
      if (fullSession?.messages?.length) {
        for (const m of fullSession.messages) {
          if (m.role === 'user') {
            messages.push({ role: 'user', content: m.content })
          } else if (m.role === 'assistant') {
            // Annotate who said it so the current responder knows
            const senderLabel = m.sender && m.sender !== 'Assistant' ? `[${m.sender}]: ` : ''
            messages.push({ role: 'assistant', content: senderLabel + (m.content || '') })
          }
        }
      }
    } else {
      for (const h of history) {
        messages.push({ role: 'user', content: h.prompt })
        if (h.answer && h.answer.trim()) {
          messages.push({ role: 'assistant', content: h.answer })
        }
      }
    }
  } else if (sessionId && _sessionDb) {
    // React path: no history sent, load conversation from SQLite
    const wsPath = _sessionDb
    const savedSession = sessionStore.loadSession(wsPath, sessionId)
    if (savedSession?.messages?.length) {
      for (const m of savedSession.messages) {
        if (m.role === 'user' || m.role === 'assistant') {
          messages.push({ role: m.role, content: m.content })
        }
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
    eventBus.dispatch('chat-status', { text: '压缩历史对话...', requestId })
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

  // Resolve workspace identity for streaming events (dynamic avatar/name)
  const _wsPath = getSessionWorkspacePath(targetWorkspaceId || null)
  const _wsObj = _wsPath ? workspaceRegistry.getWorkspaceByPath(_wsPath) : (workspaceRegistry.listWorkspaces()[0] || null)
  const _wsIdentity = {
    agentName: _wsObj?.identity?.name || currentAgentName || 'Assistant',
    avatar: _wsObj?.identity?.avatar || null,
    wsPath: _wsObj?.path || _wsPath || null,
    workspaceId: _wsObj?.id || null,
  }

  // Persist user message BEFORE streaming — crash-safe
  persistUserMessage(sessionId, prompt)

  let lastError = null
  for (const target of modelsToTry) {
    try {
      console.log(`[Paw] chat handler: provider=${target.provider} model=${target.model} msgs=${finalMessages.length} tools=${chatTools.length} reqId=${requestId}`)
      let result
      const streamConfig = { apiKey, baseUrl, model: target.model, tavilyKey: config.tavilyKey, maxToolRounds: config.maxToolRounds, maxTokens: config.maxTokens }
      if (target.provider === 'anthropic') {
        result = await streamAnthropic(finalMessages, systemPrompt, streamConfig, requestId, chatTools, sessionId, _wsIdentity)
        _lastAnthropicCallTime = Date.now()
      } else {
        result = await streamOpenAI(finalMessages, systemPrompt, streamConfig, requestId, chatTools, sessionId, _wsIdentity)
      }
      // Track token usage
      if (result?.usage && sessionId) {
        sessionStore.addTokenUsage(_sessionDb, sessionId, result.usage.inputTokens, result.usage.outputTokens)
      }
      finishChat(sessionId, requestId, result?.answer, _wsIdentity, result?.toolSteps)
      return result
    } catch (err) {
      lastError = err
      const cd = failoverManager.recordFailure(target.model, err.message)
      console.warn(`[Paw] model ${target.model} failed: ${err.message} (cooldown ${Math.round((cd.until - Date.now()) / 1000)}s, errors: ${cd.errorCount})`)
      if (target === modelsToTry[modelsToTry.length - 1]) {
        console.error('[Paw] all models failed:', err.message)
        pushStatus('error', err.message.slice(0, 80))
        finishChat(sessionId, requestId, `❌ Error: ${err.message}`, null)
        return { error: err.message }
      }
    }
  }
})

// ── IPC: Route message to determine respondents (legacy, gated) ──
ipcMain.handle('chat-route', async (_, { prompt, history, sessionId }) => {
  return { respondents: [{ name: 'Main', focus: '' }] } // legacy routing disabled
  if (!clawDir) return { respondents: [{ name: 'Main', focus: '' }] }
  if (sessionId) { currentSessionId = sessionId; syncState() }
  const config = (() => {
    const p = configPath()
    if (!p) return {}
    try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return {} }
  })()
  if (!config.apiKey) return { respondents: [{ name: 'Main', focus: '' }] }
  const sessionAgents = sessionStore.listSessionAgents(resolveSessionDb(sessionId), sessionId) || []
  if (!sessionAgents.length) return { respondents: [{ name: 'Main', focus: '' }] }
  const respondents = await coreRouteMessage(prompt, sessionAgents, history, config)
  return { respondents }
})

// Helper: reuse build-system-prompt logic (workspace-aware via F167)
async function buildSystemPrompt(overrideWorkspaceId) {
  syncState()
  // Resolve workspace path for current session (or explicit override for @mention)
  const wsPath = getSessionWorkspacePath(overrideWorkspaceId)
  return coreBuildSystemPrompt(wsPath)
}

function getSessionMode(sessionId) {
  if (!sessionId) return 'chat'
  const db = resolveSessionDb(sessionId)
  if (!db) return 'chat'
  return sessionStore.getSessionMode(db, sessionId)
}

function getSessionWorkspacePath(workspaceId, sessionId) {
  // If explicit workspaceId provided, use it directly
  if (workspaceId) {
    const wsObj = workspaceRegistry.getWorkspace(workspaceId)
    if (wsObj?.path) return wsObj.path
  }
  // Otherwise resolve from session participants (owner = participants[0])
  const sid = sessionId || currentSessionId
  if (!sid) return null
  const db = resolveSessionDb(sid)
  if (!db) return null
  try {
    const participants = sessionStore.getSessionParticipants(db, sid)
    if (participants.length > 0) {
      const wsObj = workspaceRegistry.getWorkspace(participants[0])
      if (wsObj?.path) return wsObj.path
    }
  } catch {}
  return null  // fallback to default clawDir in prompt-builder
}

// ── Group Chat: delegate_to handler ──
// Owner calls this tool to route a message to another participant.
// We build the participant's system prompt, call LLM, and return their response.
async function handleDelegateTo(input, config, sessionId) {
  const { participant_name, message } = input
  if (!participant_name || !message) return 'Error: participant_name and message are required'
  const delegateDb = resolveSessionDb(sessionId)
  if (!sessionId || !delegateDb) return 'Error: no active session'

  // Find participant workspace by name
  const participants = sessionStore.getSessionParticipants(delegateDb, sessionId)
  const workspaces = participants.map(pid => workspaceRegistry.getWorkspace(pid)).filter(Boolean)
  const targetWs = workspaces.find(w => {
    const n = (w.identity?.name || '').toLowerCase()
    const q = participant_name.toLowerCase()
    return n === q || n.startsWith(q) || q.startsWith(n)
  })
  if (!targetWs) return `Error: participant "${participant_name}" not found in group. Available: ${workspaces.map(w => w.identity?.name).join(', ')}`

  console.log(`[delegate_to] routing to ${targetWs.identity?.name} (${targetWs.id})`)

  // Build target participant's system prompt
  const targetPrompt = await coreBuildSystemPrompt(targetWs.path)

  // Add group context to their prompt
  const names = workspaces.map(w => w.identity?.name || w.id)
  const myName = targetWs.identity?.name || 'Assistant'
  const groupContext = `\n\n---\n\n## Group Chat\nYou are **${myName}** in a group conversation.\nParticipants: ${names.join(', ')}.\nThe user is talking to you. Respond as yourself (${myName}). Be natural and in-character.`
  const fullPrompt = targetPrompt + groupContext

  // Build conversation context — load recent messages from session
  const delegateMessages = []
  try {
    const fullSession = sessionStore.loadSession(delegateDb, sessionId)
    if (fullSession?.messages?.length) {
      const recent = fullSession.messages.slice(-20)
      for (const m of recent) {
        if (m.role === 'user') {
          delegateMessages.push({ role: 'user', content: m.content })
        } else if (m.role === 'assistant') {
          const senderLabel = m.sender && m.sender !== 'Assistant' ? `[${m.sender}]: ` : ''
          delegateMessages.push({ role: 'assistant', content: senderLabel + (m.content || '') })
        }
      }
    }
  } catch {}

  // Add the delegation message as the final user message
  delegateMessages.push({ role: 'user', content: message })

  // Full agent config
  const llmConfig = (() => { try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')) } catch { return {} } })()
  const provider = llmConfig.provider || 'anthropic'
  const fullConfig = { ...llmConfig, apiKey: config?.apiKey || llmConfig.apiKey, model: config?.model || llmConfig.model, baseUrl: config?.baseUrl || llmConfig.baseUrl }

  // Delegate gets all tools EXCEPT delegate_to (no recursion)
  const delegateTools = getToolsWithMcp().filter(t => t.name !== 'delegate_to')

  try {
    // Signal delegate start — frontend creates independent bubble
    const avatar = targetWs.identity?.avatar || '🤖'
    console.log(`[delegate_to] sending delegate-start: sender=${myName}, avatar=${avatar}, wsId=${targetWs.id}`)
    const parentRequestId = _activeRequestId
    if (parentRequestId) {
      eventBus.dispatch('chat-delegate-start', { requestId: parentRequestId, sender: myName, workspaceId: targetWs.id, avatar, sessionId })
    }

    // Intercept delegate stream events and remap to delegate channels via eventBus
    const delegateRid = parentRequestId + '-delegate'
    const remapHandlers = []
    const remapChannels = { 'chat-token': true, 'chat-tool-step': true, 'chat-round-info': true, 'chat-status': true, 'chat-text-start': true }
    for (const ch of Object.keys(remapChannels)) {
      const handler = (data) => {
        if (data?.requestId !== delegateRid) return
        if (ch === 'chat-token') {
          eventBus.dispatch('chat-delegate-token', { requestId: parentRequestId, sender: myName, token: data.text, thinking: data.thinking || false, sessionId })
        } else if (ch === 'chat-tool-step') {
          eventBus.dispatch('chat-delegate-token', { requestId: parentRequestId, sender: myName, toolStep: data, sessionId })
        } else if (ch === 'chat-round-info') {
          eventBus.dispatch('chat-delegate-token', { requestId: parentRequestId, sender: myName, roundInfo: data, sessionId })
        } else if (ch === 'chat-status') {
          eventBus.dispatch('chat-status', { ...data, sessionId })
        }
        // chat-text-start: no-op for delegate (text appends to same bubble)
      }
      eventBus.on(ch, handler)
      remapHandlers.push({ ch, handler })
    }

    // Save and restore active request state (delegate runs inside orchestrator's tool loop)
    const savedRequestId = _activeRequestId
    const savedAbortController = _activeAbortController

    let result
    if (provider === 'anthropic') {
      result = await streamAnthropic(delegateMessages, fullPrompt, fullConfig, delegateRid, delegateTools, sessionId)
    } else {
      result = await streamOpenAI(delegateMessages, fullPrompt, fullConfig, delegateRid, delegateTools, sessionId)
    }

    // Cleanup delegate event remapping
    for (const { ch, handler } of remapHandlers) eventBus.off(ch, handler)

    // Restore parent state
    _activeRequestId = savedRequestId
    _activeAbortController = savedAbortController

    const responseText = result?.answer || ''

    // Signal delegate end — frontend finalizes bubble
    if (parentRequestId) {
      eventBus.dispatch('chat-delegate-end', { requestId: parentRequestId, sender: myName, workspaceId: targetWs.id, fullText: responseText, sessionId })
    }

    // Accumulate delegate message — finishChat saves all messages in correct visual order
    if (parentRequestId && responseText.trim()) {
      if (!_pendingDelegateMessages.has(parentRequestId)) _pendingDelegateMessages.set(parentRequestId, [])
      _pendingDelegateMessages.get(parentRequestId).push({
        sender: myName, senderWorkspaceId: targetWs.id,
        content: responseText, timestamp: Date.now(),
        toolSteps: result?.toolSteps || undefined,
      })
    }

    console.log(`[delegate_to] ${myName} responded (${responseText.length} chars), accumulated for finishChat`)
    // Return delegate's response to the orchestrator so they can make informed decisions
    // (chain to another participant, add context, or stay silent)
    const preview = responseText.length > 300 ? responseText.slice(0, 300) + '…' : responseText
    return `[${myName} responded directly to the user]\nContent: ${preview}\n\nThe response is already visible to the user. Reply NO_REPLY unless you need to delegate further or add genuine value.`
  } catch (err) {
    console.error(`[delegate_to] error:`, err.message)
    return `Error delegating to ${myName}: ${err.message}`
  }
}

// ── Coding Agent Streaming ──

async function streamCodingAgent(agentId, prompt, { cwd, sessionId, requestId }) {
  _activeRequestId = requestId
  _activeCodingProcess = null

  // Resolve workspace identity for streaming events
  const _ccWs = workspaceRegistry.listWorkspaces()[0] || null
  const _ccIdent = { agentName: _ccWs?.identity?.name || agentId, avatar: _ccWs?.identity?.avatar || null, wsPath: _ccWs?.path || cwd, workspaceId: _ccWs?.id || null }

  pushStatus('running', `${agentId} working...`)
  eventBus.dispatch('chat-text-start', { requestId, ..._ccIdent, sessionId })

  try {
    const result = await codingAgents.run(agentId, prompt, {
      cwd,
      session: sessionId ? `paw-${sessionId}` : undefined,
      onOutput(chunk) {
        eventBus.dispatch('chat-token', { token: chunk, requestId })
      },
      onProcess(proc) {
        _activeCodingProcess = proc
      },
    })

    _activeCodingProcess = null
    pushStatus('idle', '')
    // chat-done dispatched by chat handler after persisting to SQLite
    return { answer: result.stdout, mode: 'coding', agentId }
  } catch (err) {
    _activeCodingProcess = null
    pushStatus('error', err.message?.slice(0, 80))
    throw err
  }
}

// ── Anthropic Streaming ──

async function streamAnthropic(messages, systemPrompt, config, requestId, tools, sessionId, wsIdentity) {
  _activeRequestId = requestId
  _activeAbortController = new AbortController()
  // Session-scoped dispatch helper — injects sessionId into every payload
  const ipc = (channel, data) => eventBus.dispatch(channel, { ...data, sessionId })
  // Agent timeout — prevent infinite waits (OpenClaw default: 600s)
  const timeoutMs = (config.timeoutSeconds || 600) * 1000
  const timeoutId = setTimeout(() => {
    console.warn(`[Paw] Agent timeout after ${config.timeoutSeconds || 600}s`)
    _activeAbortController?.abort(new Error('Agent timeout'))
    ipc('chat-status', { text: '超时', requestId })
  }, timeoutMs)
  const activeTools = tools || getToolsWithMcp()
  const base = (config.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')
  const endpoint = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`
  const headers = { 'Content-Type': 'application/json', 'x-api-key': getApiKey(config), 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31' }
  let fullText = '', roundText = '', msgs = [...messages]
  let flowSteps = []  // Accumulate thinking + tool steps in chronological order

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
    // Send text-start for every round (including round 0) with workspace identity
    ipc('chat-text-start', { requestId, ...(wsIdentity || {}) })
    pushStatus('thinking', 'Thinking...')

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
        ipc('chat-status', { text: '上下文溢出，压缩中...', requestId })
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
    let roundThinking = '' // Accumulate thinking for this round (tool group purpose)

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
            if (evt.delta?.type === 'thinking_delta' && evt.delta?.thinking) {
              roundThinking += evt.delta.thinking
              ipc('chat-token', { requestId, text: evt.delta.thinking, thinking: true })
            }
            if (evt.delta?.text && !curBlock) { roundText += evt.delta.text; fullText += evt.delta.text; ipc('chat-token', { requestId, text: evt.delta.text }) }
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

    // Persist thinking block into flowSteps
    if (roundThinking) flowSteps.push({ name: '__thinking__', output: roundThinking })

    if (!toolCalls.length) {
      pushStatus('done', 'Done')
      // chat-done dispatched by chat handler after persisting to SQLite
      console.log('[Paw] streamAnthropic done, fullText length:', fullText.length)
      clearTimeout(timeoutId)
      return { answer: fullText, toolSteps: flowSteps.length ? flowSteps : undefined, usage: { inputTokens: totalUsageInput, outputTokens: totalUsageOutput, cacheRead: totalCacheRead, cacheWrite: totalCacheWrite, lastInputTokens: lastUsageInput, lastCacheRead, lastCacheWrite } }
    }

    // Extract purpose from thinking — last meaningful line before tool calls
    let roundPurpose = ''
    if (roundThinking) {
      const lines = roundThinking.trim().split('\n').filter(l => l.trim().length > 5)
      // Take the last line that looks like a plan/intent (often starts with 让我/I'll/Let me/需要)
      roundPurpose = (lines[lines.length - 1] || '').trim().slice(0, 80)
    }
    // Also check roundText for intent (visible text before tool calls)
    if (!roundPurpose && roundText) {
      roundPurpose = roundText.trim().split('\n').pop()?.trim().slice(0, 80) || ''
    }

    // Execute tools and continue
    const assistantContent = []
    if (roundText) assistantContent.push({ type: 'text', text: roundText })
    for (const tc of toolCalls) assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: JSON.parse(tc.json || '{}') })
    msgs.push({ role: 'assistant', content: assistantContent })

    const SILENT_TOOLS = ['ui_status_set', 'notify', 'delegate_to', 'stay_silent', 'session_title_set']
    const toolResults = []
    let loopBlocked = false
    for (const tc of toolCalls) {
      const input = JSON.parse(tc.json || '{}')
      // Record call first, then detect (OpenClaw-aligned: record → detect → execute → recordOutcome)
      loopDetector.recordToolCall(tc.name, input)
      const loopCheck = loopDetector.check(tc.name, input)
      if (loopCheck.blocked) {
        console.warn(`[Paw] ${loopCheck.reason}`)
        toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: loopCheck.reason })
        ipc('chat-tool-step', { requestId, name: tc.name, input, output: loopCheck.reason })
        loopBlocked = true
        continue
      }
      if (loopCheck.warning) {
        console.warn(`[Paw] ${loopCheck.reason}`)
      }
      const silent = SILENT_TOOLS.includes(tc.name)
      if (!silent) pushStatus('tool', `Running ${tc.name}...`)
      let result, execError
      try {
        result = await executeTool(tc.name, input, config, { sessionId })
      } catch (err) {
        execError = err
        result = `Error: ${err.message}`
      }
      loopDetector.recordOutcome(tc.name, input, result, execError)
      if (!silent) {
        ipc('chat-tool-step', { requestId, name: tc.name, input, output: String(result).slice(0, 500) })
      }
      // Always persist to flowSteps (including silent tools like delegate_to) for DB persistence
      flowSteps.push({ name: tc.name, input, output: String(result).slice(0, 500) })
      toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: truncateToolResult(result) })
    }
    // Send round info to renderer (include purpose extracted from thinking)
    if (toolCalls.length > 0) {
      ipc('chat-round-info', { requestId, round: round + 1, purpose: roundPurpose })
    }
    msgs.push({ role: 'user', content: toolResults })
    fullText += '\n'
    ipc('chat-token', { requestId, text: '\n' })
  }
}

// ── OpenAI Streaming ──

async function streamOpenAI(messages, systemPrompt, config, requestId, tools, sessionId, wsIdentity) {
  _activeRequestId = requestId
  _activeAbortController = new AbortController()
  // Session-scoped dispatch helper — injects sessionId into every payload
  const ipc = (channel, data) => eventBus.dispatch(channel, { ...data, sessionId })
  // Agent timeout
  const timeoutMs = (config.timeoutSeconds || 600) * 1000
  const timeoutId = setTimeout(() => {
    console.warn(`[Paw] Agent timeout after ${config.timeoutSeconds || 600}s`)
    _activeAbortController?.abort(new Error('Agent timeout'))
    ipc('chat-status', { text: '超时', requestId })
  }, timeoutMs)
  const activeTools = tools || getToolsWithMcp()
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
  let flowSteps = []  // Accumulate tool steps in chronological order
  const loopDetector = new LoopDetector()
  // Usage accumulator — tracks across all rounds (OpenClaw-aligned)
  let totalUsageInput = 0, totalUsageOutput = 0

  // OpenClaw-aligned: no hard round limit
  for (let round = 0; ; round++) {
    roundText = ''
    // Send text-start for every round (including round 0) with workspace identity
    ipc('chat-text-start', { requestId, ...(wsIdentity || {}) })
    pushStatus('thinking', 'Thinking...')

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
        ipc('chat-status', { text: '上下文溢出，压缩中...', requestId })
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
            ipc('chat-token', { requestId, text: delta.content })
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
      pushStatus('done', 'Done')
      // chat-done dispatched by chat handler after persisting to SQLite
      clearTimeout(timeoutId)
      return { answer: fullText, toolSteps: flowSteps.length ? flowSteps : undefined, usage: { inputTokens: totalUsageInput, outputTokens: totalUsageOutput } }
    }

    // Build assistant message with tool_calls
    const assistantMsg = { role: 'assistant', content: roundText || null, tool_calls: tcList.map(tc => ({
      id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.args }
    }))}
    msgs.push(assistantMsg)

    // Execute tools and add results
    const SILENT_TOOLS_OAI = ['ui_status_set', 'notify', 'delegate_to', 'stay_silent', 'session_title_set']
    for (const tc of tcList) {
      let input = {}
      try { input = JSON.parse(tc.args || '{}') } catch {}
      // Record call first, then detect (OpenClaw-aligned)
      loopDetector.recordToolCall(tc.name, input)
      const loopCheck = loopDetector.check(tc.name, input)
      if (loopCheck.blocked) {
        console.warn(`[Paw] ${loopCheck.reason}`)
        ipc('chat-tool-step', { requestId, name: tc.name, input, output: loopCheck.reason })
        msgs.push({ role: 'tool', tool_call_id: tc.id, content: loopCheck.reason })
        continue
      }
      if (loopCheck.warning) {
        console.warn(`[Paw] ${loopCheck.reason}`)
      }
      const silent = SILENT_TOOLS_OAI.includes(tc.name)
      if (!silent) pushStatus('tool', `Running ${tc.name}...`)
      let result, execError
      try {
        result = await executeTool(tc.name, input, config, { sessionId })
      } catch (err) {
        execError = err
        result = `Error: ${err.message}`
      }
      loopDetector.recordOutcome(tc.name, input, result, execError)
      if (!silent) {
        ipc('chat-tool-step', { requestId, name: tc.name, input, output: String(result).slice(0, 500) })
      }
      // Always persist to flowSteps (including silent tools) for DB persistence
      flowSteps.push({ name: tc.name, input, output: String(result).slice(0, 500) })
      msgs.push({ role: 'tool', tool_call_id: tc.id, content: truncateToolResult(result) })
    }
    // Send round info to renderer (purpose from visible text for OpenAI)
    if (tcList.length > 0) {
      const oaiPurpose = roundText ? roundText.trim().split('\n').pop()?.trim().slice(0, 80) || '' : ''
      ipc('chat-round-info', { requestId, round: round + 1, purpose: oaiPurpose })
    }
    fullText += '\n'
    ipc('chat-token', { requestId, text: '\n' })
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
      const r = await fn(msgs, sp, c, hbRequestId)
      if (r?.answer && !r.answer.includes('HEARTBEAT_OK')) {
        sendNotification('Paw', r.answer.slice(0, 200))
        eventBus.dispatch('heartbeat-result', r.answer)
      }
    } catch (e) { console.error('Heartbeat error:', e.message) }
  }, ms)
}
function stopHeartbeat() { if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null } }
ipcMain.handle('heartbeat-start', () => { startHeartbeat(); return true })
ipcMain.handle('heartbeat-stop', () => { stopHeartbeat(); return true })

// ── MCP + Cron initialization ──

async function initMcpAndCron() {
  if (!clawDir) return;
  try {
    const cfg = loadConfig();

    // MCP: connect all configured servers
    if (cfg.mcpServers && typeof cfg.mcpServers === 'object') {
      console.log('[Paw] Initializing MCP servers...');
      await mcpManager.connectAll(cfg.mcpServers);
    }

    // Cron: init service
    const pawDir = path.join(clawDir, '.paw');
    fs.mkdirSync(pawDir, { recursive: true });
    cronService = new CronService({
      pawDir,
      onSystemEvent: async (text) => {
        // Inject system event into main session
        eventBus.dispatch('heartbeat-result', text);
      },
      onAgentTurn: async (payload) => {
        // Simplified: run as a heartbeat-like invocation
        try {
          const c = loadConfig();
          if (!c.apiKey) return { error: 'No API key' };
          const sp = await buildSystemPrompt();
          const msgs = [{ role: 'user', content: payload.message || payload.text || 'Cron task' }];
          const fn = (c.provider || 'anthropic') === 'anthropic' ? streamAnthropic : streamOpenAI;
          const rid = 'cron-' + Date.now().toString(36);
          await fn(msgs, sp, c, rid);
          return { status: 'ok' };
        } catch (e) {
          return { error: e.message };
        }
      },
      triggerHeartbeat: () => {
        // Re-trigger heartbeat timer
        startHeartbeat();
      },
    });
    cronService.start();
  } catch (e) {
    console.error('[Paw] MCP/Cron init error:', e.message);
  }
}

ipcMain.handle('mcp-status', () => mcpManager.getStatus())
ipcMain.handle('mcp-reconnect', async () => {
  const cfg = loadConfig();
  await mcpManager.reconnect(cfg.mcpServers || {});
  return mcpManager.getStatus();
})

// ── M8-04: Notification (moved to top, see line ~126) ──

// ── Tray Menu (AI Native) ──
let _trayStatusText = '空闲待命中'
let _trayStatusLevel = 'idle'
let _unreadCount = 0

function updateTrayTitle() {
  if (!tray) return
  tray.setTitle(_unreadCount > 0 ? `${_unreadCount}` : '')
  if (app.dock) app.dock.setBadge(_unreadCount > 0 ? `${_unreadCount}` : '')
}

function updateTrayMenu() {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    { label: '打开 Paw', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { label: '新建对话', click: () => { mainWindow?.show(); eventBus.dispatch('tray-new-chat', {}) } },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ])
  tray.setContextMenu(menu)
}

// requestId is optional - when provided, renderer routes to per-card status

ipcMain.handle('chat-cancel', () => {
  // Kill active coding agent process
  if (_activeCodingProcess && !_activeCodingProcess.killed) {
    _activeCodingProcess.kill('SIGTERM')
    setTimeout(() => { if (_activeCodingProcess && !_activeCodingProcess.killed) _activeCodingProcess.kill('SIGKILL') }, 2000)
    _activeCodingProcess = null
    return true
  }
  if (_activeAbortController) {
    _activeAbortController.abort()
    _activeAbortController = null
    return true
  }
  return false
})

function pushWatsonStatus(level, text, requestId, sessionId) {
  const rid = requestId || _activeRequestId
  const sid = sessionId || currentSessionId
  const payload = { level, text, requestId: rid, sessionId: sid }
  eventBus.dispatch('watson-status', payload)
  // Persist status to SQLite
  if (sid) {
    const db = resolveSessionDb(sid)
    if (db) try { sessionStore.updateSessionStatus(db, sid, level, text) } catch {}
  }
  // Update tray
  _trayStatusText = text || '空闲待命中'
  _trayStatusLevel = level || 'idle'
  if (tray) {
    tray.setToolTip(`Paw - ${_trayStatusText}`)
    updateTrayTitle()
    updateTrayMenu()
  }
  if (level === 'done') setTimeout(() => {
    pushWatsonStatus('idle', '空闲待命中', null)
  }, 2000)
}

ipcMain.handle('notify', (_, { title, body }) => { sendNotification(title, body); return true })

// ── Runtime state catch-up (window reconnection) ──
ipcMain.handle('get-runtime-state', () => ({
  activeRequestId: _activeRequestId,
  latestStatuses: eventBus.getLatestStatuses(),
  trayStatus: { text: _trayStatusText, level: _trayStatusLevel },
}))

ipcMain.handle('update-session-status', (_, { sessionId, level, text }) => {
  const db = resolveSessionDb(sessionId)
  if (db && sessionId) {
    try { sessionStore.updateSessionStatus(db, sessionId, level, text) } catch {}
  }
  return true
})

ipcMain.handle('cc-stop', () => {
  try { require('./tools/claude-code').ccStop() } catch {}
  return true
})
