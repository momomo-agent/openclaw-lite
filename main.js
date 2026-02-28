const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const vm = require('vm')

let mainWindow
let clawDir = null
let currentSessionId = null

// ── Session helpers ──
function sessionsDir() { return clawDir ? path.join(clawDir, 'sessions') : null }

function listSessions() {
  const dir = sessionsDir()
  if (!dir || !fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
    try { const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); return { id: d.id, title: d.title, updatedAt: d.updatedAt } } catch { return null }
  }).filter(Boolean).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

function loadSession(id) {
  const p = path.join(sessionsDir(), `${id}.json`)
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null }
}

function saveSession(session) {
  const dir = sessionsDir()
  if (!dir) return
  fs.mkdirSync(dir, { recursive: true })
  session.updatedAt = Date.now()
  fs.writeFileSync(path.join(dir, `${session.id}.json`), JSON.stringify(session, null, 2))
}

function createSession(title) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const session = { id, title: title || 'New Chat', messages: [], createdAt: Date.now(), updatedAt: Date.now() }
  saveSession(session)
  return session
}

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
]

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
      const p = path.resolve(clawDir, input.path)
      if (!p.startsWith(clawDir)) return 'Error: Path outside claw directory'
      try { return fs.readFileSync(p, 'utf8') } catch (e) { return `Error: ${e.message}` }
    }
    case 'file_write': {
      if (!clawDir) return 'Error: No claw directory'
      const p = path.resolve(clawDir, input.path)
      if (!p.startsWith(clawDir)) return 'Error: Path outside claw directory'
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, input.content)
      return `Written ${input.content.length} bytes to ${input.path}`
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
  const prefs = loadPrefs()
  clawDir = prefs.clawDir || null
  createWindow()
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

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
  for (const d of ['skills', 'memory']) {
    const p = path.join(dir, d)
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
  }

  clawDir = dir
  savePrefs({ clawDir })
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
  const p = path.join(sessionsDir(), `${id}.json`)
  try { fs.unlinkSync(p); return true } catch { return false }
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
  if (clawDir) require('electron').shell.openPath(clawDir)
})

// ── IPC: Chat with LLM ──

ipcMain.handle('chat', async (_, { prompt, history, agentId, files }) => {
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
    return await streamAnthropic(messages, systemPrompt, { apiKey, baseUrl, model, tavilyKey: config.tavilyKey }, mainWindow)
  } else {
    return await streamOpenAI(messages, systemPrompt, { apiKey, baseUrl, model, tavilyKey: config.tavilyKey }, mainWindow)
  }
})

// Helper: reuse build-system-prompt logic
async function buildSystemPrompt() {
  const parts = []
  if (!clawDir) return ''
  // All files from single directory
  for (const f of ['SOUL.md', 'MEMORY.md', 'AGENTS.md', 'NOW.md', 'USER.md', 'IDENTITY.md']) {
    const p = path.join(clawDir, f)
    if (fs.existsSync(p)) parts.push(`## ${f}\n${fs.readFileSync(p, 'utf8')}`)
  }
  const skillsDir = path.join(clawDir, 'skills')
  if (fs.existsSync(skillsDir)) {
    const skills = fs.readdirSync(skillsDir).filter(d => fs.existsSync(path.join(skillsDir, d, 'SKILL.md')))
    if (skills.length) parts.push(`## Available Skills\n${skills.map(s => `- ${s}`).join('\n')}`)
  }
  // Memory files (today + yesterday)
  const memDir = path.join(clawDir, 'memory')
  if (fs.existsSync(memDir)) {
    const today = new Date().toISOString().slice(0, 10)
    const yd = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    for (const d of [today, yd]) {
      const p = path.join(memDir, `${d}.md`)
      if (fs.existsSync(p)) parts.push(`## memory/${d}.md\n${fs.readFileSync(p, 'utf8').slice(0, 2000)}`)
    }
  }
  return parts.join('\n\n---\n\n')
}

// ── Anthropic Streaming ──

async function streamAnthropic(messages, systemPrompt, config, win) {
  const base = (config.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')
  const endpoint = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`
  const headers = { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' }
  let fullText = '', msgs = [...messages]

  for (let round = 0; round < 5; round++) {
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
            if (evt.delta?.text) { fullText += evt.delta.text; win.webContents.send('chat-token', evt.delta.text) }
            if (evt.delta?.partial_json && curBlock) curBlock.json += evt.delta.partial_json
          } else if (evt.type === 'content_block_stop' && curBlock) {
            toolCalls.push(curBlock); curBlock = null
          }
        } catch {}
      }
    }

    if (!toolCalls.length) return { answer: fullText }

    // Execute tools and continue
    const assistantContent = []
    if (fullText) assistantContent.push({ type: 'text', text: fullText })
    for (const tc of toolCalls) assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: JSON.parse(tc.json || '{}') })
    msgs.push({ role: 'assistant', content: assistantContent })

    const toolResults = []
    for (const tc of toolCalls) {
      const input = JSON.parse(tc.json || '{}')
      win.webContents.send('chat-token', `\n\n🔧 ${tc.name}...\n`)
      const result = await executeTool(tc.name, input, config)
      win.webContents.send('chat-token', `\`\`\`\n${String(result).slice(0, 500)}\n\`\`\`\n\n`)
      toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: String(result) })
    }
    msgs.push({ role: 'user', content: toolResults })
    fullText += '\n'
  }
  return { answer: fullText }
}

// ── OpenAI Streaming ──

async function streamOpenAI(messages, systemPrompt, config, win) {
  const base = (config.baseUrl || 'https://api.openai.com').replace(/\/+$/, '')
  const endpoint = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`

  const msgs = []
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt })
  msgs.push(...messages)

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model || 'gpt-4o', messages: msgs, stream: true }),
  })

  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = '', fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n'); buf = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
      try {
        const delta = JSON.parse(line.slice(6)).choices?.[0]?.delta
        if (delta?.content) {
          fullText += delta.content
          win.webContents.send('chat-token', delta.content)
        }
      } catch {}
    }
  }
  return { answer: fullText }
}
