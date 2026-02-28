// OpenClaw Lite — Renderer App

marked.setOptions({
  breaks: true,
})

let history = []

// ── Setup screen ──

async function init() {
  const prefs = await window.api.getPrefs()
  if (prefs.clawDir) enterChat()
}

async function createNew() {
  const dir = await window.api.createClawDir()
  if (dir) enterChat()
}

async function openExisting() {
  const dir = await window.api.selectClawDir()
  if (dir) enterChat()
}

async function enterChat() {
  document.getElementById('setupScreen').style.display = 'none'
  document.getElementById('chatScreen').style.display = 'flex'
  document.getElementById('input').focus()
}

// ── Chat ──

const input = document.getElementById('input')
const sendBtn = document.getElementById('sendBtn')
const messages = document.getElementById('messages')

input.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send()
})

// Auto-resize textarea
input.addEventListener('input', () => {
  input.style.height = 'auto'
  input.style.height = Math.min(input.scrollHeight, 120) + 'px'
})

async function send() {
  const text = input.value.trim()
  if (!text) return

  input.value = ''
  input.style.height = 'auto'
  sendBtn.disabled = true

  addCard('user', text)

  // Create streaming assistant card
  const card = document.createElement('div')
  card.className = 'msg-card assistant'
  card.innerHTML = '<div class="md-content"></div>'
  messages.appendChild(card)
  const contentEl = card.querySelector('.md-content')
  let fullText = ''

  const onToken = (t) => {
    fullText += t
    contentEl.innerHTML = marked.parse(fullText)
    messages.scrollTop = messages.scrollHeight
  }
  window.api.onToken(onToken)

  try {
    const result = await window.api.chat({ prompt: text, history })
    // Final render with complete text
    contentEl.innerHTML = marked.parse(result.answer || fullText)
    history.push({ prompt: text, answer: result.answer || fullText })
  } catch (err) {
    if (!fullText) {
      card.remove()
      addCard('error', err.message || String(err))
    }
  }

  sendBtn.disabled = false
  input.focus()
}

function addCard(role, content) {
  const card = document.createElement('div')
  card.className = `msg-card ${role}`

  if (role === 'user') {
    card.innerHTML = `<div class="msg-label user-label">You</div><div>${esc(content)}</div>`
  } else if (role === 'assistant') {
    card.innerHTML = `<div class="md-content">${marked.parse(content || '(no answer)')}</div>`
  } else if (role === 'error') {
    card.innerHTML = `<div style="color:#ef4444">${esc(content)}</div>`
  }

  messages.appendChild(card)
  messages.scrollTop = messages.scrollHeight
}

function addToolCard(name, output) {
  const card = document.createElement('div')
  card.className = 'msg-card tool'
  card.innerHTML = `<div class="msg-label">🔧 ${esc(name)}</div><div style="font-size:12px;color:#666">${esc(String(output).slice(0, 300))}</div>`
  messages.appendChild(card)
  messages.scrollTop = messages.scrollHeight
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

async function openSettings() {
  const config = await window.api.getConfig() || {}
  document.getElementById('cfgProvider').value = config.provider || 'anthropic'
  document.getElementById('cfgApiKey').value = config.apiKey || ''
  document.getElementById('cfgBaseUrl').value = config.baseUrl || ''
  document.getElementById('cfgModel').value = config.model || ''
  document.getElementById('cfgTavilyKey').value = config.tavilyKey || ''
  document.getElementById('settingsOverlay').style.display = 'flex'
}

function closeSettings() {
  document.getElementById('settingsOverlay').style.display = 'none'
}

async function saveSettings() {
  const config = {
    provider: document.getElementById('cfgProvider').value,
    apiKey: document.getElementById('cfgApiKey').value,
    baseUrl: document.getElementById('cfgBaseUrl').value || undefined,
    model: document.getElementById('cfgModel').value || undefined,
    tavilyKey: document.getElementById('cfgTavilyKey').value || undefined,
  }
  await window.api.saveConfig(config)
  closeSettings()
}

// Init
init()
