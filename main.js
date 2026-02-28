const { app, BrowserWindow, ipcMain, dialog, Menu, shell, Notification, Tray, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const vm = require('vm')
const { spawn } = require('child_process')

let mainWindow
let clawDir = null
let currentSessionId = null
let heartbeatTimer = null
let tray = null
let memoryWatcher = null

// ── Memory watcher ──
let memoryDebounce = null
function startMemoryWatch() {
  stopMemoryWatch()
  if (!clawDir) return
  const memDir = path.join(clawDir, 'memory')
  if (!fs.existsSync(memDir)) return
  try {
    memoryWatcher = fs.watch(memDir, { recursive: true }, (evt, filename) => {
      if (memoryDebounce) clearTimeout(memoryDebounce)
      memoryDebounce = setTimeout(() => {
        mainWindow?.webContents?.send('memory-changed', { file: filename })
      }, 300)
    })
  } catch {}
}
function stopMemoryWatch() {
  if (memoryWatcher) { memoryWatcher.close(); memoryWatcher = null }
}

// ── Session helpers (SQLite backend) ──
const sessionStore = require('./session-store')

function listSessions() { return sessionStore.listSessions(clawDir) }
function loadSession(id) { return sessionStore.loadSession(clawDir, id) }
function saveSession(session) { sessionStore.saveSession(clawDir, session) }
function createSession(title) { return sessionStore.createSession(clawDir, title) }
function deleteSessionById(id) { sessionStore.deleteSession(clawDir, id) }

// ── Agent helpers ──
function agentsDir() { return clawDir ? path.join(clawDir, 'agents') : null }

function listAgents() {
  const dir = agentsDir()
  if (!dir || !fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) } catch { return null }
  }).filter(Boolean)
}

function loadAgent(id) {
  const p = path.join(agentsDir(), `${id}.json`)
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null }
}

function saveAgent(agent) {
  const dir = agentsDir()
  if (!dir) return
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${agent.id}.json`), JSON.stringify(agent, null, 2))
}

function createAgent(name, soul, model) {
  const id = 'agent-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4)
  const agent = { id, name: name || 'Assistant', soul: soul || '', model: model || '' }
  saveAgent(agent)
  return agent
}

// ── Tool definitions ──
const TOOLS = [
  {
    name: 'search', description: 'Search the web using Tavily',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
  },
  {
    name: 'code_exec', description: 'Execute JavaScript code locally',
    input_schema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] }
  },
  {
    name: 'file_read', description: 'Read a file from the Claw directory',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
  },
  {
    name: 'file_write', description: 'Write content to a file in the Claw directory',
    input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }
  },
  {
    name: 'shell_exec', description: 'Execute a shell command in the Claw directory',
    input_schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] }
  },
  {
    name: 'notify', description: 'Send a system notification to the user',
    input_schema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['body'] }
  },
  {
    name: 'ui_status_set', description: 'Set Watson status (sidebar glanceable status line). Use 4-20 Chinese chars.',
    input_schema: { type: 'object', properties: { level: { type: 'string', enum: ['idle','thinking','running','need_you','done'] }, text: { type: 'string' } }, required: ['level','text'] }
  },
  {
    name: 'skill_exec', description: 'Execute a skill script from the workspace skills/ directory',
    input_schema: { type: 'object', properties: { skill: { type: 'string', description: 'Skill directory name' }, command: { type: 'string', description: 'Command to run inside the skill directory' } }, required: ['skill','command'] }
  },
  {
    name: 'memory_search', description: 'Semantically search MEMORY.md + memory/*.md. Use before answering questions about prior work, decisions, dates, people, preferences, or todos.',
    input_schema: { type: 'object', properties: { query: { type: 'string' }, maxResults: { type: 'number' }, minScore: { type: 'number' } }, required: ['query'] }
  },
  {
    name: 'memory_get', description: 'Read a snippet from MEMORY.md or memory/*.md with optional line range. Use after memory_search to pull needed lines.',
    input_schema: { type: 'object', properties: { path: { type: 'string' }, from: { type: 'number', description: 'Start line (1-indexed)' }, lines: { type: 'number', description: 'Number of lines to read' } }, required: ['path'] }
  },
]

// ── Memory Search (keyword-based, upgradable to FTS) ──
function searchMemoryFiles(dir, query, maxResults) {
  const results = []
  const keywords = query.split(/\s+/).filter(Boolean)
  // Collect all .md files in memory/ + root MEMORY.md
  const files = []
  const memDir = path.join(dir, 'memory')
  if (fs.existsSync(path.join(dir, 'MEMORY.md'))) files.push('MEMORY.md')
  if (fs.existsSync(memDir)) {
    const walk = (d, prefix) => {
      for (const f of fs.readdirSync(d)) {
        const full = path.join(d, f)
        const rel = prefix ? `${prefix}/${f}` : f
        if (fs.statSync(full).isDirectory()) walk(full, rel)
        else if (f.endsWith('.md')) files.push(`memory/${rel}`)
      }
    }
    walk(memDir, '')
  }
  // Search each file
  for (const relPath of files) {
    const content = fs.readFileSync(path.join(dir, relPath), 'utf8')
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase()
      const hits = keywords.filter(k => lower.includes(k)).length
      if (hits === 0) continue
      const score = hits / keywords.length
      const start = Math.max(0, i - 1)
      const end = Math.min(lines.length, i + 3)
      const snippet = lines.slice(start, end).join('\n').slice(0, 500)
      results.push({ path: relPath, startLine: start + 1, endLine: end, score, snippet })
    }
  }
  results.sort((a, b) => b.score - a.score)
  // Dedupe overlapping snippets
  const seen = new Set()
  const deduped = []
  for (const r of results) {
    const key = `${r.path}:${Math.floor(r.startLine / 4)}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(r)
    if (deduped.length >= maxResults) break
  }
  return deduped
}

async function executeTool(name, input, config) {
  switch (name) {
    case 'search': {
      const key = config?.tavilyKey
      if (!key) return 'Error: No Tavily API key configured'
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key, query: input.query, max_results: 5 }),
      })
      if (!res.ok) return `Search error: ${res.status}`
      const data = await res.json()
      return data.results?.map(r => `${r.title}\n${r.url}\n${r.content}`).join('\n\n') || 'No results'
    }
    case 'code_exec': {
      try {
        const sandbox = { result: undefined, console: { log: (...a) => a.join(' ') } }
        vm.createContext(sandbox)
        sandbox.result = vm.runInContext(input.code, sandbox, { timeout: 5000 })
        return String(sandbox.result)
      } catch (e) { return `Error: ${e.message}` }
    }
    case 'file_read': {
      if (!clawDir) return 'Error: No claw directory'
      const wsDir = path.join(clawDir, 'workspace')
      fs.mkdirSync(wsDir, { recursive: true })
      const p = path.resolve(wsDir, input.path)
      if (!p.startsWith(clawDir)) return 'Error: Path outside claw directory'
      try { return fs.readFileSync(p, 'utf8') } catch (e) { return `Error: ${e.message}` }
    }
    case 'file_write': {
      if (!clawDir) return 'Error: No claw directory'
      const wsDir = path.join(clawDir, 'workspace')
      const p = path.resolve(wsDir, input.path)
      if (!p.startsWith(clawDir)) return 'Error: Path outside claw directory'
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, input.content)
      return `Written ${input.content.length} bytes to workspace/${input.path}`
    }
    case 'shell_exec': {
      if (!clawDir) return 'Error: No claw directory'
      const wsDir = path.join(clawDir, 'workspace')
      fs.mkdirSync(wsDir, { recursive: true })
      const { execSync } = require('child_process')
      try {
        const out = execSync(input.command, { cwd: wsDir, timeout: 30000, maxBuffer: 1024 * 512, encoding: 'utf8' })
        return out.slice(0, 5000) || '(no output)'
      } catch (e) { return `Error: ${e.stderr || e.message}`.slice(0, 2000) }
    }
    case 'notify': {
      sendNotification(input.title || 'Paw', input.body)
      return 'Notification sent'
    }
    case 'ui_status_set': {
      const level = String(input.level || 'idle')
      const text = String(input.text || '').trim()
      const minLen = 4, maxLen = 20
      if (!['idle','thinking','running','need_you','done'].includes(level)) return 'Error: invalid level'
      if (text.length < minLen || text.length > maxLen) {
        return `Error: text length must be ${minLen}-${maxLen} chars (got ${text.length}). Please rewrite shorter/longer.`
      }
      pushWatsonStatus(level, text)
      return 'OK'
    }
    case 'skill_exec': {
      if (!clawDir) return 'Error: No claw directory'
      const skillDir = path.resolve(clawDir, 'skills', input.skill || '')
      if (!skillDir.startsWith(path.join(clawDir, 'skills'))) return 'Error: Path outside skills directory'
      if (!fs.existsSync(skillDir)) return `Error: Skill not found: ${input.skill}`
      const { execSync } = require('child_process')
      try {
        const out = execSync(input.command, { cwd: skillDir, timeout: 30000, maxBuffer: 1024 * 512, encoding: 'utf8' })
        return out.slice(0, 5000) || '(no output)'
      } catch (e) { return `Error: ${e.stderr || e.message}`.slice(0, 2000) }
    }
    case 'memory_get': {
      if (!clawDir) return 'Error: No claw directory'
      const relPath = (input.path || '').trim()
      if (!relPath) return 'Error: path required'
      if (!relPath.endsWith('.md')) return 'Error: only .md files allowed'
      const absPath = path.resolve(clawDir, relPath)
      if (!absPath.startsWith(clawDir)) return 'Error: path outside workspace'
      if (!fs.existsSync(absPath)) return `Error: file not found: ${relPath}`
      const content = fs.readFileSync(absPath, 'utf8')
      if (!input.from && !input.lines) return JSON.stringify({ text: content, path: relPath })
      const allLines = content.split('\n')
      const start = Math.max(1, input.from || 1)
      const count = Math.max(1, input.lines || allLines.length)
      const slice = allLines.slice(start - 1, start - 1 + count)
      return JSON.stringify({ text: slice.join('\n'), path: relPath, from: start, lines: slice.length })
    }
    case 'memory_search': {
      if (!clawDir) return 'Error: No claw directory'
      const query = (input.query || '').trim().toLowerCase()
      if (!query) return 'Error: query required'
      const maxResults = input.maxResults || 5
      const results = searchMemoryFiles(clawDir, query, maxResults)
      return JSON.stringify({ results })
    }
    default: return `Unknown tool: ${name}`
  }
}

// Persist directory choices
const PREFS_PATH = path.join(app.getPath('userData'), 'prefs.json')

function loadPrefs() {
  try { return JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8')) } catch { return {} }
}
function savePrefs(p) {
  fs.writeFileSync(PREFS_PATH, JSON.stringify(p, null, 2))
}

// app.disableHardwareAcceleration() — removed: conflicts with hiddenInset rendering

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
    sessionStore.migrateFromJson(clawDir)
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

  // Tray icon — AI Native menubar presence
  const trayIconPath = path.join(__dirname, 'assets', 'trayTemplate.png')
  let trayIcon
  if (fs.existsSync(trayIconPath)) {
    trayIcon = nativeImage.createFromPath(trayIconPath)
    trayIcon.setTemplateImage(true)
  } else {
    trayIcon = nativeImage.createEmpty()
  }
  tray = new Tray(trayIcon)
  tray.setToolTip('Paw — 空闲待命中')
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus() })
  updateTrayMenu()
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('will-quit', () => { sessionStore.closeDb() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

async function openNewWindow() {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Choose workspace folder' })
  if (result.canceled || !result.filePaths[0]) return
  const electronPath = process.argv[0]
  const appPath = app.getAppPath()
  spawn(electronPath, [appPath, `--claw-dir=${result.filePaths[0]}`], { detached: true, stdio: 'ignore' }).unref()
}

// ── IPC: Directory selection ──

ipcMain.handle('get-prefs', () => ({ clawDir }))

ipcMain.handle('create-claw-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose location for new Claw directory',
  })
  if (result.canceled || !result.filePaths[0]) return null
  const dir = result.filePaths[0]

  // Scaffold initial files
  const scaffold = {
    'config.json': JSON.stringify({ provider: 'anthropic', apiKey: '', model: '' }, null, 2),
    'SOUL.md': '# Soul\n\nDescribe who your AI assistant is.\n',
    'AGENTS.md': '# Agents\n\nWorkspace instructions and conventions.\n',
    'USER.md': '# User\n\nAbout you.\n',
  }
  for (const [name, content] of Object.entries(scaffold)) {
    const p = path.join(dir, name)
    if (!fs.existsSync(p)) fs.writeFileSync(p, content)
  }
  for (const d of ['skills', 'memory', 'sessions', 'agents', 'workspace']) {
    const p = path.join(dir, d)
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
  }

  clawDir = dir
  savePrefs({ clawDir })
  sessionStore.migrateFromJson(clawDir)
  startMemoryWatch()
  return dir
})

ipcMain.handle('select-claw-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Claw Directory',
  })
  if (!result.canceled && result.filePaths[0]) {
    clawDir = result.filePaths[0]
    savePrefs({ clawDir })
    // Ensure essential subdirectories exist
    for (const sub of ['memory', 'sessions', 'agents', 'skills', 'workspace']) {
      const d = path.join(clawDir, sub)
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
    }
    startMemoryWatch()
    sessionStore.migrateFromJson(clawDir)
    return clawDir
  }
  return null
})

// ── IPC: Read config.json from data dir ──

ipcMain.handle('get-config', () => {
  if (!clawDir) return null
  const p = path.join(clawDir, 'config.json')
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return {} }
})

ipcMain.handle('save-config', (_, config) => {
  if (!clawDir) return false
  fs.writeFileSync(path.join(clawDir, 'config.json'), JSON.stringify(config, null, 2))
  return true
})

// ── IPC: Sessions ──

ipcMain.handle('sessions-list', () => listSessions())
ipcMain.handle('session-load', (_, id) => loadSession(id))
ipcMain.handle('session-save', (_, session) => { saveSession(session); return true })
ipcMain.handle('session-create', (_, title) => createSession(title))
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

// ── IPC: Agents ──

ipcMain.handle('agents-list', () => listAgents())
ipcMain.handle('agent-load', (_, id) => loadAgent(id))
ipcMain.handle('agent-save', (_, agent) => { saveAgent(agent); return true })
ipcMain.handle('agent-create', (_, { name, soul, model }) => createAgent(name, soul, model))
ipcMain.handle('agent-delete', (_, id) => {
  const p = path.join(agentsDir(), `${id}.json`)
  try { fs.unlinkSync(p); return true } catch { return false }
})

// ── IPC: Session members ──

ipcMain.handle('session-add-member', (_, { sessionId, agentId }) => {
  const s = loadSession(sessionId)
  if (!s) return false
  if (!s.members) s.members = ['user']
  if (!s.members.includes(agentId)) s.members.push(agentId)
  saveSession(s)
  return true
})

ipcMain.handle('session-remove-member', (_, { sessionId, agentId }) => {
  const s = loadSession(sessionId)
  if (!s || !s.members) return false
  s.members = s.members.filter(m => m !== agentId)
  saveSession(s)
  return true
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

// Current active requestId — renderer calls chat-prepare to get it before chat()
let _nextRequestId = null
ipcMain.handle('chat-prepare', () => {
  _nextRequestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  return _nextRequestId
})

ipcMain.handle('chat', async (_, { prompt, history, agentId, files }) => {
  const requestId = _nextRequestId || Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  _nextRequestId = null
  const config = (() => {
    if (!clawDir) return {}
    const p = path.join(clawDir, 'config.json')
    try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return {} }
  })()

  const agent = agentId ? loadAgent(agentId) : null
  const provider = config.provider || 'anthropic'
  const apiKey = config.apiKey
  const baseUrl = config.baseUrl
  const model = agent?.model || config.model
  if (!apiKey) throw new Error('No API key configured. Click ⚙️ to set up.')

  // Build system prompt — agent soul takes priority
  let systemPrompt = await buildSystemPrompt()
  if (agent?.soul) systemPrompt = agent.soul + '\n\n---\n\n' + systemPrompt

  // Build messages
  const messages = []
  if (history?.length) {
    for (const h of history) {
      messages.push({ role: 'user', content: h.prompt })
      messages.push({ role: 'assistant', content: h.answer })
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
  userContent.push({ type: 'text', text: prompt || '(attached files)' })
  messages.push({ role: 'user', content: userContent })

  if (provider === 'anthropic') {
    return await streamAnthropic(messages, systemPrompt, { apiKey, baseUrl, model, tavilyKey: config.tavilyKey }, mainWindow, requestId)
  } else {
    return await streamOpenAI(messages, systemPrompt, { apiKey, baseUrl, model, tavilyKey: config.tavilyKey }, mainWindow, requestId)
  }
})

// Helper: reuse build-system-prompt logic
async function buildSystemPrompt() {
  const parts = []
  if (!clawDir) return ''
  // Cold boot loading chain — aligned with OpenClaw AGENTS.md order
  // 1. Core identity files (ordered)
  for (const f of ['SOUL.md', 'USER.md', 'NOW.md', 'AGENTS.md', 'IDENTITY.md']) {
    const p = path.join(clawDir, f)
    if (fs.existsSync(p)) parts.push(`## ${f}\n${fs.readFileSync(p, 'utf8')}`)
  }
  // 2. Memory navigation + shared state
  const memDir = path.join(clawDir, 'memory')
  if (fs.existsSync(memDir)) {
    for (const f of ['INDEX.md', 'SHARED.md', 'SUBCONSCIOUS.md']) {
      const p = path.join(memDir, f)
      if (fs.existsSync(p)) parts.push(`## memory/${f}\n${fs.readFileSync(p, 'utf8').slice(0, 2000)}`)
    }
    // 3. Today + yesterday daily notes
    const today = new Date().toISOString().slice(0, 10)
    const yd = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    for (const d of [today, yd]) {
      const p = path.join(memDir, `${d}.md`)
      if (fs.existsSync(p)) parts.push(`## memory/${d}.md\n${fs.readFileSync(p, 'utf8').slice(0, 2000)}`)
    }
  }
  // 4. Long-term memory (last, biggest file)
  const memoryMd = path.join(clawDir, 'MEMORY.md')
  if (fs.existsSync(memoryMd)) parts.push(`## MEMORY.md\n${fs.readFileSync(memoryMd, 'utf8')}`)
  // 5. Skills
  const skillsDir = path.join(clawDir, 'skills')
  if (fs.existsSync(skillsDir)) {
    const skills = fs.readdirSync(skillsDir).filter(d => fs.existsSync(path.join(skillsDir, d, 'SKILL.md')))
    for (const s of skills) {
      const content = fs.readFileSync(path.join(skillsDir, s, 'SKILL.md'), 'utf8').slice(0, 3000)
      parts.push(`## Skill: ${s}\n${content}`)
    }
  }
  // 6. Memory sync instructions
  parts.push('## Memory Sync\nAll sessions share the same memory/ directory. Write important context to memory/ files (e.g. memory/SHARED.md) so other sessions can see it. Use memory_search to recall prior context before answering questions about past work, decisions, or preferences.')
  parts.push(`## Tools & Capabilities
You are running inside Paw, an AI-native desktop app with these tools:
- **search**: Search the web (Tavily). Use for research, lookups, current info.
- **file_read**: Read files from the workspace directory.
- **file_write**: Write/create files in the workspace. USE THIS when the user asks you to create reports, save content, write markdown, etc. Always write the actual file, don't just output text.
- **shell_exec**: Run shell commands in the workspace.
- **code_exec**: Execute JavaScript locally.
- **notify**: Send a desktop notification.
- **skill_exec**: Run a skill script.
- **memory_search**: Search MEMORY.md + memory/*.md by keywords. Use BEFORE answering questions about prior work, decisions, dates, people, preferences, or todos.
- **memory_get**: Read a snippet from MEMORY.md or memory/*.md with optional line range. Use AFTER memory_search to pull only the needed lines.
- **ui_status_set**: Update the sidebar status line (4-20 Chinese chars).

### Important Rules
- When the user asks you to "write", "save", "create a file", or "存成markdown" — you MUST call file_write to actually create the file. Do not just output the content as text.
- After writing a file, tell the user the file path.
- Use ui_status_set to keep the status updated: at start, before tools, when done.
- You can chain multiple tools in sequence (up to 5 rounds). For example: search → search → file_write.
- Before answering questions about past work, decisions, or preferences — call memory_search first.
- Prefer Chinese for status text. Example: '在撰写报告' or '已保存文件'.`)

  return parts.join('\n\n---\n\n')
}

// ── Anthropic Streaming ──

async function streamAnthropic(messages, systemPrompt, config, win, requestId) {
  _activeRequestId = requestId
  const base = (config.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')
  const endpoint = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`
  const headers = { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' }
  let fullText = '', roundText = '', msgs = [...messages]

  for (let round = 0; round < 5; round++) {
    roundText = ''
    if (round > 0) win.webContents.send('chat-text-start', { requestId })
    pushStatus(win, 'thinking', 'Thinking...')
    const body = {
      model: config.model || 'claude-sonnet-4-20250514',
      max_tokens: 4096, stream: true,
      system: systemPrompt || undefined,
      messages: msgs, tools: TOOLS,
    }
    const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = '', toolCalls = [], curBlock = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n'); buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const evt = JSON.parse(line.slice(6))
          if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
            curBlock = { id: evt.content_block.id, name: evt.content_block.name, json: '' }
          } else if (evt.type === 'content_block_delta') {
            if (evt.delta?.text) { roundText += evt.delta.text; fullText += evt.delta.text; win.webContents.send('chat-token', { requestId, text: evt.delta.text }) }
            if (evt.delta?.partial_json && curBlock) curBlock.json += evt.delta.partial_json
          } else if (evt.type === 'content_block_stop' && curBlock) {
            toolCalls.push(curBlock); curBlock = null
          }
        } catch {}
      }
    }

    if (!toolCalls.length) {
      pushStatus(win, 'done', 'Done')
      console.log('[Paw] streamAnthropic done, fullText length:', fullText.length)
      return { answer: fullText }
    }

    // Execute tools and continue
    const assistantContent = []
    if (roundText) assistantContent.push({ type: 'text', text: roundText })
    for (const tc of toolCalls) assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: JSON.parse(tc.json || '{}') })
    msgs.push({ role: 'assistant', content: assistantContent })

    const SILENT_TOOLS = ['ui_status_set', 'notify']
    const toolResults = []
    for (const tc of toolCalls) {
      const input = JSON.parse(tc.json || '{}')
      const silent = SILENT_TOOLS.includes(tc.name)
      if (!silent) pushStatus(win, 'tool', `Running ${tc.name}...`)
      const result = await executeTool(tc.name, input, config)
      if (!silent) {
        win.webContents.send('chat-tool-step', { requestId, name: tc.name, output: String(result).slice(0, 500) })
      }
      toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: String(result) })
    }
    msgs.push({ role: 'user', content: toolResults })
    fullText += '\n'
    win.webContents.send('chat-token', { requestId, text: '\n' })
  }
  pushStatus(win, 'done', 'Done')
  return { answer: fullText }
}

// ── OpenAI Streaming ──

async function streamOpenAI(messages, systemPrompt, config, win, requestId) {
  _activeRequestId = requestId
  const base = (config.baseUrl || 'https://api.openai.com').replace(/\/+$/, '')
  const endpoint = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`

  // Convert TOOLS to OpenAI function calling format
  const oaiTools = TOOLS.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema }
  }))

  const msgs = []
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt })
  msgs.push(...messages)

  let fullText = '', roundText = ''

  for (let round = 0; round < 5; round++) {
    roundText = ''
    if (round > 0) win.webContents.send('chat-text-start', { requestId })
    pushStatus(win, 'thinking', 'Thinking...')

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model || 'gpt-4o', messages: msgs, stream: true, tools: oaiTools }),
    })
    if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = '', toolCalls = {}

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n'); buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
        try {
          const choice = JSON.parse(line.slice(6)).choices?.[0]
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
    if (!tcList.length || !tcList[0].name) {
      pushStatus(win, 'done', 'Done')
      return { answer: fullText }
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
      const silent = SILENT_TOOLS_OAI.includes(tc.name)
      if (!silent) pushStatus(win, 'tool', `Running ${tc.name}...`)
      const result = await executeTool(tc.name, input, config)
      if (!silent) {
        win.webContents.send('chat-tool-step', { requestId, name: tc.name, output: String(result).slice(0, 500) })
      }
      msgs.push({ role: 'tool', tool_call_id: tc.id, content: String(result) })
    }
    fullText += '\n'
    win.webContents.send('chat-token', { requestId, text: '\n' })
  }

  pushStatus(win, 'done', 'Done')
  return { answer: fullText }
}

// ── M8-01: Heartbeat ──

function startHeartbeat() {
  stopHeartbeat()
  if (!clawDir) return
  let cfg; try { cfg = JSON.parse(fs.readFileSync(path.join(clawDir, 'config.json'), 'utf8')) } catch { return }
  const hb = cfg.heartbeat; if (!hb?.enabled) return
  const ms = (hb.intervalMinutes || 30) * 60000
  const prompt = hb.prompt || 'Heartbeat: check if anything needs attention. Reply HEARTBEAT_OK if nothing.'
  heartbeatTimer = setInterval(async () => {
    try {
      const c = JSON.parse(fs.readFileSync(path.join(clawDir, 'config.json'), 'utf8'))
      if (!c.apiKey) return
      const sp = await buildSystemPrompt()
      const msgs = [{ role: 'user', content: prompt }]
      const fn = (c.provider || 'anthropic') === 'anthropic' ? streamAnthropic : streamOpenAI
      const r = await fn(msgs, sp, c, mainWindow)
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

// ── M8-04: Notification ──

function pushStatus(win, state, detail) {
  win?.webContents?.send('agent-status', { state, detail })
  if (tray) tray.setToolTip(`Paw — ${detail || state}`)
}

function sendNotification(title, body) {
  if (Notification.isSupported()) new Notification({ title, body }).show()
}

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

// requestId is optional — when provided, renderer routes to per-card status
let _activeRequestId = null
function pushWatsonStatus(level, text, requestId) {
  const rid = requestId || _activeRequestId
  const payload = { level, text, requestId: rid }
  mainWindow?.webContents?.send('watson-status', payload)
  // Update tray
  _trayStatusText = text || '空闲待命中'
  _trayStatusLevel = level || 'idle'
  if (tray) {
    tray.setToolTip(`Paw — ${_trayStatusText}`)
    // macOS: set tray title to show status text next to icon
    tray.setTitle(level === 'idle' ? '' : text)
    updateTrayMenu()
  }
  if (level === 'done') setTimeout(() => {
    pushWatsonStatus('idle', '空闲待命中', null)
  }, 2000)
}

ipcMain.handle('notify', (_, { title, body }) => { sendNotification(title, body); return true })
