const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

let mainWindow
let dataDir = null   // ~/.openclaw/ compatible
let workDir = null   // ~/clawd/ compatible

// Persist directory choices
const PREFS_PATH = path.join(app.getPath('userData'), 'prefs.json')

function loadPrefs() {
  try { return JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8')) } catch { return {} }
}
function savePrefs(p) {
  fs.writeFileSync(PREFS_PATH, JSON.stringify(p, null, 2))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900, height: 700,
    minWidth: 600, minHeight: 400,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow.loadFile('renderer/index.html')
}

app.whenReady().then(() => {
  const prefs = loadPrefs()
  dataDir = prefs.dataDir || null
  workDir = prefs.workDir || null
  createWindow()
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

// ── IPC: Directory selection ──

ipcMain.handle('get-prefs', () => ({ dataDir, workDir }))

ipcMain.handle('select-data-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Data Directory (e.g. ~/.openclaw)',
  })
  if (!result.canceled && result.filePaths[0]) {
    dataDir = result.filePaths[0]
    savePrefs({ dataDir, workDir })
    return dataDir
  }
  return null
})

ipcMain.handle('select-work-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Workspace Directory (e.g. ~/clawd)',
  })
  if (!result.canceled && result.filePaths[0]) {
    workDir = result.filePaths[0]
    savePrefs({ dataDir, workDir })
    return workDir
  }
  return null
})

// ── IPC: Read config.json from data dir ──

ipcMain.handle('get-config', () => {
  if (!dataDir) return null
  const p = path.join(dataDir, 'config.json')
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return {} }
})

ipcMain.handle('save-config', (_, config) => {
  if (!dataDir) return false
  fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify(config, null, 2))
  return true
})

// ── IPC: Build system prompt from directories ──

ipcMain.handle('build-system-prompt', () => {
  const parts = []

  // Data dir files
  if (dataDir) {
    for (const f of ['SOUL.md', 'MEMORY.md']) {
      const p = path.join(dataDir, f)
      if (fs.existsSync(p)) parts.push(`## ${f}\n${fs.readFileSync(p, 'utf8')}`)
    }
    // Skills
    const skillsDir = path.join(dataDir, 'skills')
    if (fs.existsSync(skillsDir)) {
      const skills = fs.readdirSync(skillsDir).filter(d => fs.existsSync(path.join(skillsDir, d, 'SKILL.md')))
      if (skills.length) {
        parts.push(`## Available Skills\n${skills.map(s => `- ${s}`).join('\n')}`)
      }
    }
  }

  // Workspace files
  if (workDir) {
    for (const f of ['AGENTS.md', 'NOW.md', 'USER.md', 'IDENTITY.md']) {
      const p = path.join(workDir, f)
      if (fs.existsSync(p)) parts.push(`## ${f}\n${fs.readFileSync(p, 'utf8')}`)
    }
  }

  return parts.join('\n\n---\n\n')
})

// ── IPC: Chat with LLM ──

ipcMain.handle('chat', async (_, { prompt, history }) => {
  const config = (() => {
    if (!dataDir) return {}
    const p = path.join(dataDir, 'config.json')
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

  // Call LLM
  if (provider === 'anthropic') {
    return await callAnthropic(messages, systemPrompt, { apiKey, baseUrl, model })
  } else {
    return await callOpenAI(messages, systemPrompt, { apiKey, baseUrl, model })
  }
})

// Helper: reuse build-system-prompt logic
async function buildSystemPrompt() {
  const parts = []
  if (dataDir) {
    for (const f of ['SOUL.md', 'MEMORY.md']) {
      const p = path.join(dataDir, f)
      if (fs.existsSync(p)) parts.push(`## ${f}\n${fs.readFileSync(p, 'utf8')}`)
    }
  }
  if (workDir) {
    for (const f of ['AGENTS.md', 'NOW.md', 'USER.md', 'IDENTITY.md']) {
      const p = path.join(workDir, f)
      if (fs.existsSync(p)) parts.push(`## ${f}\n${fs.readFileSync(p, 'utf8')}`)
    }
  }
  return parts.join('\n\n---\n\n')
}

// ── Anthropic API ──

async function callAnthropic(messages, systemPrompt, config) {
  const base = (config.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')
  const endpoint = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model || 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt || undefined,
      messages,
    }),
  })

  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text = data.content?.map(b => b.type === 'text' ? b.text : '').join('') || ''
  return { answer: text }
}

// ── OpenAI API ──

async function callOpenAI(messages, systemPrompt, config) {
  const base = (config.baseUrl || 'https://api.openai.com').replace(/\/+$/, '')
  const endpoint = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`

  const msgs = []
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt })
  msgs.push(...messages)

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o',
      messages: msgs,
    }),
  })

  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content || ''
  return { answer: text }
}
