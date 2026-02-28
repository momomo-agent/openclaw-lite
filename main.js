const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')

let mainWindow
let clawDir = null   // single directory for everything

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
      try { return String(eval(input.code)) } catch (e) { return `Error: ${e.message}` }
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

app.disableHardwareAcceleration()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900, height: 700,
    minWidth: 600, minHeight: 400,
    backgroundColor: '#0a0a0a',
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

// ── IPC: Build system prompt from directories ──

ipcMain.handle('build-system-prompt', () => buildSystemPrompt())

// ── IPC: Chat with LLM ──

ipcMain.handle('chat', async (_, { prompt, history }) => {
  const config = (() => {
    if (!clawDir) return {}
    const p = path.join(clawDir, 'config.json')
    try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return {} }
  })()

  const provider = config.provider || 'anthropic'
  const apiKey = config.apiKey
  const baseUrl = config.baseUrl
  const model = config.model
  if (!apiKey) throw new Error('No API key configured. Click ⚙️ to set up.')

  // Build system prompt
  const systemPrompt = await buildSystemPrompt()

  // Build messages
  const messages = []
  if (history?.length) {
    for (const h of history) {
      messages.push({ role: 'user', content: h.prompt })
      messages.push({ role: 'assistant', content: h.answer })
    }
  }
  messages.push({ role: 'user', content: prompt })

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
