// Paw — Renderer App

marked.setOptions({
  breaks: true,
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value
    return hljs.highlightAuto(code).value
  },
})

let history = []
let currentSessionId = null

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
  await refreshSessionList()
  // Auto-create first session if none exist
  const sessions = await window.api.listSessions()
  if (!sessions.length) await newSession()
  else await switchSession(sessions[0].id)
  document.getElementById('input').focus()
}

// ── Session management ──

async function refreshSessionList() {
  const sessions = await window.api.listSessions()
  const list = document.getElementById('sessionList')
  list.innerHTML = ''
  for (const s of sessions) {
    const el = document.createElement('div')
    el.className = 'session-item' + (s.id === currentSessionId ? ' active' : '')
    el.innerHTML = `<span>${esc(s.title)}</span><span class="del-btn" onclick="event.stopPropagation();deleteSession('${s.id}')">✕</span>`
    el.onclick = () => switchSession(s.id)
    list.appendChild(el)
  }
}

async function switchSession(id) {
  const session = await window.api.loadSession(id)
  if (!session) return
  currentSessionId = id
  history = []
  messages.innerHTML = ''
  document.getElementById('sessionTitle').textContent = session.title
  const agents = await window.api.listAgents()
  for (const m of session.messages) {
    const sender = m.sender || (m.role === 'user' ? 'You' : 'Assistant')
    addCard(m.role, m.content, sender)
    if (m.role === 'user') history.push({ prompt: m.content, answer: '' })
    if (m.role === 'assistant' && history.length) history[history.length - 1].answer = m.content
  }
  await refreshSessionList()
}

async function newSession() {
  const session = await window.api.createSession('New Chat')
  currentSessionId = session.id
  history = []
  messages.innerHTML = ''
  document.getElementById('sessionTitle').textContent = session.title
  await refreshSessionList()
}

async function deleteSession(id) {
  await window.api.deleteSession(id)
  if (id === currentSessionId) {
    const sessions = await window.api.listSessions()
    if (sessions.length) await switchSession(sessions[0].id)
    else await newSession()
  } else {
    await refreshSessionList()
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('hidden')
}

async function exportChat() {
  if (!currentSessionId) return
  const md = await window.api.exportSession(currentSessionId)
  if (!md) return
  const blob = new Blob([md], { type: 'text/markdown' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `chat-${currentSessionId}.md`
  a.click()
}

// ── Chat ──

const input = document.getElementById('input')
const sendBtn = document.getElementById('sendBtn')
const messages = document.getElementById('messages')

input.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send()
})

// Cmd+K to focus input
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); input.focus() }
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

  // Detect @mention to pick agent
  let targetAgentId = null, targetAgentName = 'Assistant'
  const mention = text.match(/^@(\S+)\s/)
  if (mention && currentSessionId) {
    const agents = await window.api.listAgents()
    const found = agents.find(a => a.name.toLowerCase() === mention[1].toLowerCase())
    if (found) { targetAgentId = found.id; targetAgentName = found.name }
  }
  // Fallback: first agent member in session
  if (!targetAgentId && currentSessionId) {
    const s = await window.api.loadSession(currentSessionId)
    if (s?.members) {
      const agents = await window.api.listAgents()
      const first = s.members.find(m => m !== 'user')
      if (first) { const a = agents.find(x => x.id === first); if (a) { targetAgentId = a.id; targetAgentName = a.name } }
    }
  }

  addCard('user', text, 'You')

  const card = document.createElement('div')
  card.className = 'msg-card assistant'
  const _t = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
  card.innerHTML = `<div class="msg-avatar">🤖</div><div class="msg-body"><div class="msg-header"><span class="msg-name">${esc(targetAgentName)}</span><span class="msg-time">${_t}</span></div><div class="msg-content md-content"></div></div>`
  messages.appendChild(card)
  const contentEl = card.querySelector('.md-content')
  let fullText = ''

  window.api.onToken((t) => {
    fullText += t
    contentEl.innerHTML = marked.parse(fullText)
    messages.scrollTop = messages.scrollHeight
  })

  try {
    const result = await window.api.chat({ prompt: text, history, agentId: targetAgentId })
    contentEl.innerHTML = marked.parse(result.answer || fullText)
    // Auto-collapse tool steps
    collapseToolSteps()
    history.push({ prompt: text, answer: result.answer || fullText })
    // Persist to session
    if (currentSessionId) {
      const s = await window.api.loadSession(currentSessionId)
      if (s) {
        s.messages.push(
          { role: 'user', content: text, sender: 'You' },
          { role: 'assistant', content: result.answer || fullText, sender: targetAgentName }
        )
        if (s.messages.length === 2) s.title = text.slice(0, 40)
        await window.api.saveSession(s)
        document.getElementById('sessionTitle').textContent = s.title
        await refreshSessionList()
      }
    }
  } catch (err) {
    if (!fullText) {
      card.remove()
      addCard('error', err.message || String(err))
    }
  }

  sendBtn.disabled = false
  input.focus()
}

function addCard(role, content, sender) {
  const card = document.createElement('div')
  card.className = `msg-card ${role}`
  const avatar = role === 'user' ? '👤' : '🤖'
  const nameClass = role === 'user' ? 'msg-name user-name' : 'msg-name'
  const time = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})

  if (role === 'error') {
    card.innerHTML = `<div class="msg-avatar">⚠️</div><div class="msg-body"><div class="msg-content" style="color:#ef4444">${esc(content)}</div></div>`
  } else if (role === 'user') {
    card.innerHTML = `<div class="msg-avatar">${avatar}</div><div class="msg-body"><div class="msg-header"><span class="${nameClass}">${esc(sender||'You')}</span><span class="msg-time">${time}</span></div><div class="msg-content">${esc(content)}</div></div>`
  } else {
    card.innerHTML = `<div class="msg-avatar">${avatar}</div><div class="msg-body"><div class="msg-header"><span class="${nameClass}">${esc(sender||'Assistant')}</span><span class="msg-time">${time}</span></div><div class="msg-content md-content">${marked.parse(content||'')}</div></div>`
  }

  messages.appendChild(card)
  messages.scrollTop = messages.scrollHeight
}

function addToolCard(name, output) {
  const card = document.createElement('div')
  card.className = 'msg-card tool tool-step'
  card.innerHTML = `<div class="msg-avatar" style="width:24px;height:24px;font-size:12px">🔧</div><div class="msg-body"><div class="msg-name" style="font-size:12px;color:#555">${esc(name)}</div><div style="font-size:12px;color:#444">${esc(String(output).slice(0,200))}</div></div>`
  messages.appendChild(card)
  messages.scrollTop = messages.scrollHeight
}

function collapseToolSteps() {
  const steps = messages.querySelectorAll('.tool-step:not(.grouped)')
  if (steps.length === 0) return
  const group = document.createElement('div')
  group.className = 'tool-group collapsed'
  const toggle = document.createElement('div')
  toggle.className = 'tool-group-toggle'
  toggle.textContent = `▶ ${steps.length} tool step${steps.length > 1 ? 's' : ''}`
  toggle.onclick = () => {
    group.classList.toggle('collapsed')
    toggle.textContent = group.classList.contains('collapsed')
      ? `▶ ${steps.length} tool step${steps.length > 1 ? 's' : ''}`
      : `▼ ${steps.length} tool step${steps.length > 1 ? 's' : ''}`
  }
  group.appendChild(toggle)
  steps.forEach(s => { s.classList.add('grouped'); group.appendChild(s) })
  // Insert group before the final assistant card
  const lastAssistant = messages.querySelector('.msg-card.assistant:last-of-type')
  if (lastAssistant) messages.insertBefore(group, lastAssistant)
  else messages.appendChild(group)
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

// ── Members panel ──

async function toggleMembers() {
  document.getElementById('membersOverlay').style.display = 'flex'
  await refreshMemberList()
}
function closeMembers() { document.getElementById('membersOverlay').style.display = 'none' }

async function refreshMemberList() {
  if (!currentSessionId) return
  const session = await window.api.loadSession(currentSessionId)
  const agents = await window.api.listAgents()
  const members = session?.members || ['user']
  const list = document.getElementById('memberList')
  list.innerHTML = ''
  for (const m of members) {
    const el = document.createElement('div')
    el.className = 'member-item'
    if (m === 'user') {
      el.innerHTML = '<span>👤 You</span>'
    } else {
      const agent = agents.find(a => a.id === m)
      el.innerHTML = `<span>🤖 ${esc(agent?.name || m)}</span><span class="del-btn" onclick="removeMember('${m}')">✕</span>`
    }
    list.appendChild(el)
  }
  // Populate add dropdown with agents not in session
  const select = document.getElementById('addAgentSelect')
  select.innerHTML = '<option value="">Select agent...</option>'
  for (const a of agents) {
    if (!members.includes(a.id)) select.innerHTML += `<option value="${a.id}">${esc(a.name)}</option>`
  }
}

async function addAgentToSession() {
  const id = document.getElementById('addAgentSelect').value
  if (!id || !currentSessionId) return
  await window.api.addMember(currentSessionId, id)
  await refreshMemberList()
}

async function removeMember(agentId) {
  if (!currentSessionId) return
  await window.api.removeMember(currentSessionId, agentId)
  await refreshMemberList()
}

// ── Agent manager ──

function openAgentManager() { closeMembers(); document.getElementById('agentManagerOverlay').style.display = 'flex'; refreshAgentList() }
function closeAgentManager() { document.getElementById('agentManagerOverlay').style.display = 'none' }

async function refreshAgentList() {
  const agents = await window.api.listAgents()
  const list = document.getElementById('agentList')
  list.innerHTML = ''
  for (const a of agents) {
    const el = document.createElement('div')
    el.className = 'agent-item'
    el.innerHTML = `<span>🤖 ${esc(a.name)}</span><span class="del-btn" onclick="deleteAgent('${a.id}')">✕</span>`
    list.appendChild(el)
  }
}

async function createNewAgent() {
  const name = document.getElementById('newAgentName').value.trim()
  if (!name) return
  const soul = document.getElementById('newAgentSoul').value
  const model = document.getElementById('newAgentModel').value.trim()
  await window.api.createAgent({ name, soul, model })
  document.getElementById('newAgentName').value = ''
  document.getElementById('newAgentSoul').value = ''
  document.getElementById('newAgentModel').value = ''
  await refreshAgentList()
}

async function deleteAgent(id) {
  await window.api.deleteAgent(id)
  await refreshAgentList()
}

// Init
init()
