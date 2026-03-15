const { app, BrowserWindow, ipcMain, dialog, Menu, shell, Notification, Tray, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const vm = require('vm')
const { spawn } = require('child_process')

// Fix PATH for packaged app (Electron strips user shell PATH)
if (app.isPackaged) {
  const extraPaths = [
    '/usr/local/bin', '/opt/homebrew/bin',
    path.join(require('os').homedir(), '.npm-global/bin'),
    path.join(require('os').homedir(), '.local/bin'),
    path.join(require('os').homedir(), 'Library/pnpm'),
  ]
  process.env.PATH = [...extraPaths, process.env.PATH].join(':')
}
const memoryIndex = require('./memory-index')
const { getTool, getAnthropicTools, getToolsPrompt } = require('./tools')
const { loadAllSkills } = require('./skills/frontmatter')
const { gatherContext } = require('./core/context-sensing')

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
const { ChatQueue } = require('./core/chat-queue')
const workspaceRegistry = require('./core/workspace-registry')

// ── Feature flags ──

// ── Helper functions (must be defined early) ──
let _activeRequestId = null
let _activeAbortController = null
const chatQueue = new ChatQueue()
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
const { startHeartbeat: coreStartHeartbeat, stopHeartbeat: coreStopHeartbeat, startHeartbeatCron, stopHeartbeatCron, isWithinActiveHours, buildHeartbeatPrompt, processHeartbeatResponse } = require('./core/heartbeat')
const { McpManager } = require('./core/mcp-client')
const { CronService } = require('./core/cron')
const { updateTrayMenu: coreUpdateTrayMenu } = require('./core/tray')
const { buildMemoryIndex: coreBuildMemoryIndex, startMemoryWatch: coreStartMemoryWatch, stopMemoryWatch: coreStopMemoryWatch } = require('./core/memory-watch')
const { buildSystemPrompt: coreBuildSystemPrompt } = require('./core/prompt-builder')
const { routeMessage: coreRouteMessage } = require('./core/router')
const { streamAnthropicRaw: coreLlmAnthropicRaw, streamOpenAIRaw: coreLlmOpenAIRaw } = require('./core/llm-raw')
const acpx = require('./core/acpx')
const codingAgents = require('./core/coding-agents')
// coding-agent-registry.js removed — coding agents are now workspace records
// M39 extracted modules
const { streamAnthropic } = require('./core/stream-anthropic')
const { streamOpenAI } = require('./core/stream-openai')
const { handleDelegateTo } = require('./core/delegate')
const { loadCCSessions: _loadCCSessions, routeToCodingAgent, streamCodingAgent } = require('./core/coding-agent-router')

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

/**
 * Convert raw error messages into user-friendly text.
 * Strips IPC wrappers, classifies errors, adds actionable hints.
 */
function friendlyError(err) {
  let msg = typeof err === 'string' ? err : err?.message || 'Unknown error'

  // Strip Electron IPC wrapper
  msg = msg.replace(/^Error invoking remote method '[^']+': Error: /i, '')
  msg = msg.replace(/^Error: /i, '')

  // Classify and rewrite
  const lower = msg.toLowerCase()

  if (lower.includes('no api key') || lower.includes('api key')) {
    return { short: 'No API key', detail: 'Go to Settings (⚙️) to configure your API key.', category: 'config' }
  }
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('invalid.*key')) {
    return { short: 'Invalid API key', detail: 'Your API key was rejected. Check Settings (⚙️) to update it.', category: 'auth' }
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many')) {
    return { short: 'Rate limited', detail: 'Too many requests. Wait a moment and try again.', category: 'rate-limit' }
  }
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('etimedout')) {
    return { short: 'Request timed out', detail: 'The server took too long to respond. Try again.', category: 'network' }
  }
  if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('network') || lower.includes('fetch failed')) {
    return { short: 'Network error', detail: 'Could not reach the API server. Check your internet connection.', category: 'network' }
  }
  if (lower.includes('overloaded') || lower.includes('529') || lower.includes('503') || lower.includes('server error')) {
    return { short: 'Server overloaded', detail: 'The API server is temporarily overloaded. Try again in a few seconds.', category: 'server' }
  }
  if (lower.includes('context') && lower.includes('long')) {
    return { short: 'Context too long', detail: 'The conversation is too long for the model. Start a new chat or compact the history.', category: 'context' }
  }
  if (lower.includes('not available') || lower.includes('not found')) {
    return { short: 'Service unavailable', detail: msg, category: 'unavailable' }
  }

  // Default: sanitize but keep the message
  return { short: msg.length > 80 ? msg.slice(0, 77) + '…' : msg, detail: msg, category: 'unknown' }
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
  if (!wsPath) return null
  return sessionStore.loadSession(wsPath, id)
}

function saveSession(session) {
  const wsPath = getSessionWorkspace(session.id)
  if (wsPath) sessionStore.saveSession(wsPath, session)
}

function createSession(title, opts) {
  // Resolve target workspace: explicit workspaceId > first participant > active clawDir > first registered
  // IMPORTANT: coding-agent workspaces don't have their own DB, so use the first local workspace instead
  let targetWsPath = null
  const wsId = opts?.workspaceId || (opts?.participants && opts.participants[0])
  if (wsId) {
    const ws = workspaceRegistry.getWorkspace(wsId)
    if (ws && ws.type !== 'coding-agent') targetWsPath = ws.path
  }
  if (!targetWsPath) targetWsPath = clawDir || workspaceRegistry.listWorkspaces().find(w => w.type !== 'coding-agent')?.path
  if (!targetWsPath) return null
  // Auto-populate participants from workspaceId if not explicitly provided
  if (opts?.workspaceId && (!opts.participants || opts.participants.length === 0)) {
    opts = { ...opts, participants: [opts.workspaceId] }
  }
  // Auto-title for coding-agent sessions: use agent name + project folder
  if (!title && opts?.participants?.length) {
    const firstWs = workspaceRegistry.getWorkspace(opts.participants[0])
    if (firstWs?.type === 'coding-agent') {
      const folder = require('path').basename(firstWs.path)
      title = `${firstWs.identity?.name || firstWs.engine} · ${folder}`
    }
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
    return await handleDelegateTo(input, config, sid, ctx)
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

// ── Shared context for extracted modules (M39) ──
// Provides cross-cutting deps to core/stream-*.js, core/delegate.js, core/coding-agent-router.js
const ctx = {
  // Mutable state refs (modules read/write these directly)
  get _activeRequestId() { return _activeRequestId },
  set _activeRequestId(v) { _activeRequestId = v },
  get _activeAbortController() { return _activeAbortController },
  set _activeAbortController(v) { _activeAbortController = v },
  get _activeCodingProcess() { return _activeCodingProcess },
  set _activeCodingProcess(v) { _activeCodingProcess = v },
  _pendingDelegateMessages,
  // Functions
  pushStatus,
  executeTool,
  getToolsWithMcp,
  truncateToolResult,
  scrubMagicStrings,
  isContextOverflowError,
  compactHistory,
  configPath,
  loadConfig,
  resolveSessionDb,
  sessionStore,
  // Streaming (for delegate.js which calls streaming recursively)
  streamAnthropic: (msgs, sp, cfg, rid, tools, sid, wsId) => streamAnthropic(msgs, sp, cfg, rid, tools, sid, wsId, ctx),
  streamOpenAI: (msgs, sp, cfg, rid, tools, sid, wsId) => streamOpenAI(msgs, sp, cfg, rid, tools, sid, wsId, ctx),
  routeToCodingAgent: (ws, msg, opts) => routeToCodingAgent(ws, msg, opts, ctx),
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
  'chat-done', 'chat-error', 'chat-status', 'chat-queued',
  'chat-delegate-start', 'chat-delegate-token', 'chat-delegate-end',
  'agent-status', 'watson-status',
  'session-agents-changed', 'session-expired', 'tasks-changed',
  'heartbeat-result', 'tray-new-chat', 'memory-changed',
  'auto-rotate', 'workspace-changed',
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

// ── E2E test mode: enable CDP ──
const E2E_PORT = (() => {
  const arg = process.argv.find(a => a.startsWith('--e2e-port='))
  return arg ? parseInt(arg.split('=')[1], 10) : null
})()
if (E2E_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', String(E2E_PORT))
  console.log(`[e2e] CDP enabled on port ${E2E_PORT}`)
}

app.whenReady().then(() => {
  // Initialize acpx + coding agents
  acpx.init()
  codingAgents.init()

  // Initialize workspace registry
  workspaceRegistry.initRegistry()

  // Load persisted coding agent session IDs (for Claude Code SDK resume)
  _loadCCSessions()

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
  if (cronService) { cronService.stop(); cronService = null }
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
  // Restart heartbeat + cron for new workspace
  stopHeartbeat(); startHeartbeat()
  if (cronService) cronService.stop()
  initMcpAndCron()
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
    // Restart heartbeat + cron for selected workspace
    stopHeartbeat(); startHeartbeat()
    if (cronService) cronService.stop()
    initMcpAndCron()
    return clawDir
  }
  return null
})

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Project Directory',
  })
  return result.canceled ? null : result.filePaths[0]
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

// ── IPC: Coding Agent as Workspace (unified architecture) ──

ipcMain.handle('coding-agents-list', () => {
  // Return coding-agent workspaces instead of separate registry
  const allWs = workspaceRegistry.listWorkspaces()
  const codingWs = allWs.filter(w => w.type === 'coding-agent')
  return codingWs
})

ipcMain.handle('workspace-add-coding-agent', async (_, { engine, projectPath }) => {
  if (!projectPath) {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Select Project Folder' })
    if (result.canceled || !result.filePaths[0]) return { ok: false, error: 'cancelled' }
    projectPath = result.filePaths[0]
  }
  const ws = workspaceRegistry.addCodingAgentWorkspace(engine, projectPath)
  eventBus.emit('workspace-changed')
  return { ok: true, workspace: ws }
})

// Legacy: coding-agent-add redirects to workspace-add-coding-agent
ipcMain.handle('coding-agent-add', async (_, { engine, projectPath, name }) => {
  if (!projectPath) {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Select Project Folder' })
    if (result.canceled || !result.filePaths[0]) return { ok: false, error: 'cancelled' }
    projectPath = result.filePaths[0]
  }
  const ws = workspaceRegistry.addCodingAgentWorkspace(engine, projectPath)
  return { ok: true, agent: ws }
})

ipcMain.handle('coding-agent-delete', (_, id) => {
  return workspaceRegistry.removeWorkspace(id)
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
  const res = workspaceRegistry.addWorkspace(wsPath)
  eventBus.emit('workspace-changed')
  return res
})

ipcMain.handle('workspace-remove', (_, id) => {
  const res = workspaceRegistry.removeWorkspace(id)
  eventBus.emit('workspace-changed')
  return res
})

ipcMain.handle('workspace-create', async (_, { name, parentDir, avatar, description } = {}) => {
  if (!parentDir) {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], title: '选择存放位置' })
    if (result.canceled || !result.filePaths[0]) return { ok: false, error: 'cancelled' }
    parentDir = result.filePaths[0]
  }
  const res = workspaceRegistry.createWorkspace(parentDir, name, { avatar, description })
  eventBus.emit('workspace-changed')
  return res
})

ipcMain.handle('workspace-update-identity', (_, { id, name, avatar, description }) => {
  const res = workspaceRegistry.updateWorkspaceIdentity(id, { name, avatar, description })
  eventBus.emit('workspace-changed')
  return res
})

ipcMain.handle('workspace-set-avatar', async (_, { id, presetIndex, customPath }) => {
  const ws = workspaceRegistry.getWorkspace(id)
  if (!ws) return { ok: false, error: 'not_found' }
  try {
    let res
    if (presetIndex !== undefined) {
      res = workspaceRegistry.updateWorkspaceIdentity(id, { avatar: `preset:${presetIndex}` })
    } else if (customPath) {
      const dest = path.join(ws.path, '.paw', 'avatar.png')
      fs.mkdirSync(path.join(ws.path, '.paw'), { recursive: true })
      fs.copyFileSync(customPath, dest)
      res = workspaceRegistry.updateWorkspaceIdentity(id, { avatar: 'avatar.png' })
    } else {
      return { ok: false, error: 'no_source' }
    }
    eventBus.emit('workspace-changed')
    return res
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

// Open image/video/audio/markdown in a new Electron window
ipcMain.handle('open-file-preview', (_, filePath) => {
  const p = path.resolve(clawDir || '', filePath)
  if (!fs.existsSync(p)) return
  const ext = path.extname(p).toLowerCase().slice(1)
  const imgExts = ['png','jpg','jpeg','gif','webp','svg']
  const vidExts = ['mp4','mov','webm','mkv','avi']
  const audExts = ['mp3','wav','ogg','m4a','flac','aac']
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
  } else if (audExts.includes(ext)) {
    const name = path.basename(p)
    win.setSize(400, 160)
    win.loadURL(`data:text/html,<html><body style="margin:0;background:#1a1a1a;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#e0e0e0"><p style="margin:0 0 16px;font-size:14px;opacity:.7">${name}</p><audio src="file://${encodeURI(p)}" controls autoplay style="width:320px"></audio></body></html>`)
  } else if (mdExts.includes(ext)) {
    const raw = fs.readFileSync(p, 'utf8')
    // Render markdown with a simple built-in stylesheet
    const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Basic markdown → HTML (headers, bold, italic, code blocks, inline code, lists, links)
    const rendered = escaped
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^\- (.+)$/gm, '<li>$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\n\n/g, '<br><br>')
    const css = `body{margin:40px auto;max-width:720px;background:#1a1a1a;color:#e0e0e0;font-family:system-ui,-apple-system,sans-serif;line-height:1.7;font-size:15px}h1,h2,h3{color:#fff;margin:1.2em 0 .4em}h1{font-size:1.8em;border-bottom:1px solid #333;padding-bottom:.3em}h2{font-size:1.4em}h3{font-size:1.15em}pre{background:#111;padding:16px;border-radius:8px;overflow-x:auto;font-size:13px}code{background:#222;padding:2px 6px;border-radius:4px;font-size:13px}pre code{background:none;padding:0}a{color:#7aa2f7;text-decoration:none}a:hover{text-decoration:underline}li{margin:4px 0}strong{color:#fff}`
    win.loadURL(`data:text/html,<html><head><style>${css}</style></head><body>${rendered}</body></html>`)
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

function finishChat(sessionId, requestId, assistantText, wsIdentity, toolSteps, isError) {
  const wsPath = sessionId ? (getSessionWorkspace(sessionId) || clawDir) : null
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
  // ── Error message persistence ──
  if (wsPath && isError && assistantText) {
    sessionStore.appendMessage(wsPath, sessionId, {
      role: 'assistant', content: assistantText, timestamp: Date.now(), isError: true,
    })
  }
  eventBus.dispatch('chat-done', { requestId, sessionId, error: isError ? assistantText : undefined })
  // Unread count: increment when window not focused
  if (!isError && mainWindow && !mainWindow.isFocused()) {
    _unreadCount++
    updateTrayTitle()
  }

  // ── Queue drain: collect all queued messages and process as one ──
  if (sessionId) {
    chatQueue.markIdle(sessionId)
    const merged = chatQueue.drainAndMerge(sessionId)
    if (merged) {
      console.log(`[Paw] Draining queued message(s) for session ${sessionId.slice(0, 8)}`)
      _runChat(merged).catch(err => console.error('[Paw] Queue drain error:', err))
    }
  }
}

ipcMain.handle('chat', async (_, { prompt, message, history, rawMessages, agentId, files, attachments, sessionId, requestId: paramRequestId, focus, targetWorkspaceId }) => {
  // React sends { message, attachments }, vanilla sends { prompt, files } — support both
  prompt = prompt || message || ''
  files = files || attachments || []
  const requestId = paramRequestId || Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  // Sync sessionId from renderer
  if (sessionId) { currentSessionId = sessionId; syncState() }

  // ── Queue: if this session already has an active reply, queue the message ──
  if (sessionId && chatQueue.isActive(sessionId)) {
    const queued = chatQueue.enqueue(sessionId, { prompt, files, agentId, sessionId, requestId, focus, targetWorkspaceId, userMessageSaved: true })
    if (queued) {
      console.log(`[Paw] Queued message for session ${sessionId.slice(0, 8)} (depth: ${chatQueue.depth(sessionId)})`)
      // Save user message to DB immediately (crash-safe, appears in UI on reload)
      persistUserMessage(sessionId, prompt)
      eventBus.dispatch('chat-queued', { requestId, sessionId, depth: chatQueue.depth(sessionId) })
      return { queued: true, depth: chatQueue.depth(sessionId) }
    }
  }

  // Start _runChat async — don't await (streaming events go via eventBus, not IPC return)
  _runChat({ prompt, files, agentId, sessionId, requestId, focus, targetWorkspaceId, rawMessages, history })
    .catch(err => console.error('[Paw] _runChat error:', err))
  return { started: true }
})

async function _runChat({ prompt, files, agentId, sessionId, requestId, focus, targetWorkspaceId, userMessageSaved, rawMessages, history }) {
  if (sessionId) { chatQueue.markActive(sessionId) }

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

  // ── Check for 1v1 coding-agent session ──
  const caDb = resolveSessionDb(sessionId)
  if (sessionId && caDb) {
    const participants = sessionStore.getSessionParticipants(caDb, sessionId)
    if (participants.length === 1) {
      const ws = workspaceRegistry.getWorkspace(participants[0])
      if (ws?.type === 'coding-agent') {
        console.log(`[chat] 1v1 coding-agent session: ${ws.engine} at ${ws.path}`)

        let result
        try {
          result = await routeToCodingAgent(ws, prompt, {
            sessionId,
            requestId,
            senderName: null,
            senderAvatar: null
          }, ctx)
        } catch (err) {
          console.error(`[chat] 1v1 CA routeToCodingAgent error:`, err)
          result = `Error: ${err.message}`
        }
        // Save user message
        sessionStore.appendMessage(caDb, sessionId, {
          role: 'user', content: prompt, timestamp: Date.now()
        })
        // Save assistant response with workspace identity
        sessionStore.appendMessage(caDb, sessionId, {
          role: 'assistant',
          content: result,
          timestamp: Date.now(),
          sender: ws.identity?.name || ws.engine,
          avatar: ws.identity?.avatar,
          senderWorkspaceId: ws.id
        })
        // Auto-title: if session has no title, set from user's first message
        try {
          const title = sessionStore.getSessionTitle(caDb, sessionId)
          if (!title) {
            const autoTitle = prompt.replace(/\n+/g, ' ').trim()
            const trimmed = autoTitle.length > 20 ? autoTitle.slice(0, 20) + '…' : autoTitle
            if (trimmed) {
              sessionStore.renameSession(caDb, sessionId, trimmed)
              if (mainWindow?.webContents) {
                mainWindow.webContents.send('session-title-updated', { sessionId, title: trimmed })
              }
            }
          }
        } catch {}
        eventBus.dispatch('chat-done', { requestId, sessionId })
        return { answer: result }
      }
    }
  }

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
      }, ctx)
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
  if (!apiKey) throw new Error('No API key configured. Open Settings to set up.')

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
        const typeHint = w?.type === 'coding-agent' ? ` (coding agent — ${w.engine || 'code'})` : ''
        return { id: pid, name: w?.identity?.name || pid, description: (w?.identity?.description || '') + typeHint }
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
5. **Removed members are gone.** Do NOT delegate to or mention them as active.
6. **Untitled session** → call \`session_title_set\` to set a title.`
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
        if (m.role === 'user') {
          messages.push({ role: 'user', content: m.content })
        } else if (m.role === 'assistant') {
          // Group chat: annotate sender so orchestrator knows who said what
          const senderLabel = _isGroupChat && m.sender && m.sender !== 'Assistant' ? `[${m.sender}]: ` : ''
          messages.push({ role: 'assistant', content: senderLabel + (m.content || '') })
        }
      }
    }
  }
  // Build user content (text + file attachments)
  const userContent = []
  let fileContext = ''  // paths of non-image files, appended to prompt

  if (files?.length) {
    for (const f of files) {
      if (f.type?.startsWith('image/')) {
        // Image → vision API (base64)
        let base64 = null
        if (f.path && fs.existsSync(f.path)) {
          base64 = fs.readFileSync(f.path).toString('base64')
        } else if (f.data) {
          base64 = f.data.replace(/^data:[^;]+;base64,/, '')
        }
        if (base64) {
          userContent.push({ type: 'image', source: { type: 'base64', media_type: f.type, data: base64 } })
        }
      } else if (f.path) {
        // Non-image file → just provide the path (LLM can use file_read if needed)
        const stat = fs.existsSync(f.path) ? fs.statSync(f.path) : null
        const isDir = stat?.isDirectory()
        const sizeStr = stat ? `${(stat.size / 1024).toFixed(1)}KB` : ''
        fileContext += `\n📎 ${isDir ? '📁' : ''} ${f.path}${sizeStr ? ` (${sizeStr})` : ''}`
      }
    }
  }

  // Link understanding - async fetch link summaries (non-blocking)
  let linkContext = ''
  try { linkContext = await extractLinkContext(prompt) } catch {}
  const contextSuffix = [
    fileContext ? `\n\n[Attached files]${fileContext}` : '',
    linkContext ? `\n\n---\n[Auto-fetched link context]\n${linkContext}` : '',
  ].filter(Boolean).join('')
  const textWithContext = contextSuffix ? `${prompt}${contextSuffix}` : prompt
  userContent.push({ type: 'text', text: textWithContext || '(attached files)' })
  messages.push({ role: 'user', content: userContent })

  // Session pruning — trim old tool results before token counting (cache-TTL aware)
  const prunedMessages = pruneToolResults(messages, { lastCallTime: _lastAnthropicCallTime, provider })

  // Context compaction - auto-compress if history too long (model-aware threshold)
  const compactThreshold = getCompactThreshold(model)
  const totalTokens = estimateMessagesTokens(prunedMessages)
  let finalMessages = prunedMessages
  let compacted = false

  // Memory flush before compaction — save durable memories before context is lost
  const softThreshold = compactThreshold - 4000 // flush 4K tokens before hard compact
  if (totalTokens > softThreshold && prunedMessages.length > COMPACT_KEEP_RECENT * 2 + 2 && clawDir) {
    try {
      console.log(`[memory-flush] ${totalTokens} tokens near compaction threshold, triggering memory flush`)
      const flushPrompt = `Pre-compaction memory flush. Store durable memories now (use memory/${new Date().toISOString().slice(0,10)}.md; create memory/ if needed). IMPORTANT: If the file already exists, APPEND new content only — do not overwrite existing entries. If nothing to store, reply with NO_REPLY.`
      const flushMsgs = [...prunedMessages, { role: 'user', content: flushPrompt }]
      const flushReqId = 'memflush-' + Date.now().toString(36)
      const flushStreamFn = provider === 'anthropic' ? streamAnthropic : streamOpenAI
      await flushStreamFn(flushMsgs, systemPrompt, { apiKey, baseUrl, model }, flushReqId, getToolsWithMcp(), sessionId, null, ctx)
      console.log('[memory-flush] complete')
    } catch (e) {
      console.warn('[memory-flush] failed:', e.message)
    }
  }

  if (totalTokens > compactThreshold && prunedMessages.length > COMPACT_KEEP_RECENT * 2 + 2) {
    console.log(`[compaction] ${totalTokens} tokens exceeds threshold ${compactThreshold} (model: ${model}), compacting...`)
    eventBus.dispatch('chat-status', { text: '压缩历史对话...', requestId })
    finalMessages = await compactHistory(prunedMessages, { apiKey, baseUrl, model, provider })
    compacted = true
  }

  // ── Ambient context sensing (silent, user-invisible) ──
  try {
    const ctx_sensing = await gatherContext()
    if (ctx_sensing?.text) {
      console.log('[context-sensing] injected:', ctx_sensing.text.slice(0, 100))
      systemPrompt += ctx_sensing.text
    } else {
      console.log('[context-sensing] no context gathered')
    }
  } catch (err) {
    console.warn('[context-sensing] failed:', err.message)
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

  // Persist user message BEFORE streaming — crash-safe (skip if already saved by queue)
  if (!userMessageSaved) persistUserMessage(sessionId, prompt)

  let lastError = null
  for (const target of modelsToTry) {
    try {
      console.log(`[Paw] chat handler: provider=${target.provider} model=${target.model} msgs=${finalMessages.length} tools=${chatTools.length} reqId=${requestId}`)
      let result
      const streamConfig = { apiKey, baseUrl, model: target.model, tavilyKey: config.tavilyKey, maxToolRounds: config.maxToolRounds, maxTokens: config.maxTokens }
      if (target.provider === 'anthropic') {
        result = await streamAnthropic(finalMessages, systemPrompt, streamConfig, requestId, chatTools, sessionId, _wsIdentity, ctx)
        _lastAnthropicCallTime = Date.now()
      } else {
        result = await streamOpenAI(finalMessages, systemPrompt, streamConfig, requestId, chatTools, sessionId, _wsIdentity, ctx)
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
        const fe = friendlyError(err)
        pushStatus('error', fe.short)
        finishChat(sessionId, requestId, `${fe.short}\n\n${fe.detail}`, null, null, true)
        return { error: `${fe.short}\n\n${fe.detail}` }
      }
    }
  }
}

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

// ── Coding Agent routing → extracted to core/coding-agent-router.js (M39) ──
// ── Group Chat delegate_to → extracted to core/delegate.js (M39) ──
// ── Streaming engines → extracted to core/stream-anthropic.js + core/stream-openai.js (M39) ──

// ── M8-01: Heartbeat (OpenClaw-aligned) ──

function startHeartbeat() {
  stopHeartbeat()
  if (!clawDir) return
  let cfg; try { cfg = JSON.parse(fs.readFileSync(configPath(), 'utf8')) } catch { return }
  if (cfg.heartbeat?.enabled === false) return
  const hb = cfg.heartbeat || {}
  const ms = (hb.intervalMinutes || 30) * 60000

  heartbeatTimer = setInterval(async () => {
    try {
      const c = JSON.parse(fs.readFileSync(configPath(), 'utf8'))
      if (!c.apiKey) return

      // Active hours check
      if (!isWithinActiveHours(c.heartbeat?.activeHours)) {
        console.log('[heartbeat] Outside active hours, skipping')
        return
      }

      // Build prompt from HEARTBEAT.md
      const prompt = buildHeartbeatPrompt(clawDir, c)
      if (!prompt) {
        console.log('[heartbeat] HEARTBEAT.md empty, skipping')
        return
      }

      // Light context: only inject HEARTBEAT.md, not full system prompt
      const lightContext = c.heartbeat?.lightContext
      let sp
      if (lightContext) {
        sp = 'You are a local AI assistant. Follow HEARTBEAT.md instructions strictly.\nIf nothing needs attention, reply HEARTBEAT_OK.\nDo not include HEARTBEAT_OK in alert messages.'
      } else {
        sp = await buildSystemPrompt()
        sp += '\n\n## Heartbeat\nThis is a heartbeat check. Follow HEARTBEAT.md if it exists. If nothing needs attention, reply with HEARTBEAT_OK. Do not include HEARTBEAT_OK in alert messages.'
      }

      const msgs = [{ role: 'user', content: prompt }]
      const hbStreamFn = (c.provider || 'anthropic') === 'anthropic' ? streamAnthropic : streamOpenAI
      const hbRequestId = 'hb-' + Date.now().toString(36)
      const r = await hbStreamFn(msgs, sp, c, hbRequestId, null, null, null, ctx)

      // Process response with HEARTBEAT_OK contract
      const alert = processHeartbeatResponse(r?.answer, c.heartbeat?.ackMaxChars)
      if (alert) {
        sendNotification('Paw', alert.slice(0, 200))
        eventBus.dispatch('heartbeat-result', alert)
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
          const cronStreamFn = (c.provider || 'anthropic') === 'anthropic' ? streamAnthropic : streamOpenAI;
          const rid = 'cron-' + Date.now().toString(36);
          await cronStreamFn(msgs, sp, c, rid, null, null, null, ctx);
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
    pushWatsonStatus('idle', '空闲待命中', null, sid)
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


