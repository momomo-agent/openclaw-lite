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

  // User message card
  addCard('user', text)

  // Call LLM
  try {
    const result = await window.api.chat({ prompt: text, history })
    if (result.toolCalls?.length) {
      for (const tc of result.toolCalls) {
        addToolCard(tc.tool, tc.output)
      }
    }
    addCard('assistant', result.answer)
    history.push({ prompt: text, answer: result.answer })
  } catch (err) {
    addCard('error', err.message || String(err))
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

function openSettings() {
  document.getElementById('chatScreen').style.display = 'none'
  document.getElementById('setupScreen').style.display = 'flex'
}

// Init
init()
