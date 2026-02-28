// Paw — Renderer App

// ── Request Event Bus ──
// All chat requests register here; events are routed by requestId
const requestHandlers = new Map() // requestId -> { onToken, onToolStep, onStatus }

// Persistent listeners — never removed, just dispatch by requestId
window.api.onToken((d) => {
  const h = requestHandlers.get(d.requestId)
  if (h?.onToken) h.onToken(d)
})
window.api.onToolStep((d) => {
  const h = requestHandlers.get(d.requestId)
  if (h?.onToolStep) h.onToolStep(d)
})

// Watson status — update both global sidebar AND active request's card
window.api.onWatsonStatus(({ level, text, requestId }) => {
  // Global sidebar (kept for idle/general status)
  const dot = document.getElementById('watsonDot')
  const t = document.getElementById('watsonText')
  if (dot) dot.className = `watson-dot ${level}`
  if (t) t.textContent = text || ''
  // Per-card status if requestId provided
  if (requestId) {
    const h = requestHandlers.get(requestId)
    if (h?.onStatus) h.onStatus(level, text)
  }
})

// Memory change listener
window.api.onMemoryChanged(({ file }) => {
  const el = document.getElementById('watsonText')
  if (!el) return
  const prev = el.textContent
  el.textContent = `记忆已更新: ${file || ''}`
  setTimeout(() => { if (el.textContent.startsWith('记忆已更新')) el.textContent = prev }, 3000)
})

// Tray menu: new chat
window.api.onTrayNewChat(() => { newSession() })

marked.setOptions({
  breaks: true,
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value
    return hljs.highlightAuto(code).value
  },
})

// File click handler — detect file paths in rendered messages
document.addEventListener('click', async (e) => {
  const el = e.target.closest('.file-link')
  if (!el) return
  e.preventDefault()
  const fp = el.dataset.path
  const ext = fp.split('.').pop().toLowerCase()
  const imgExts = ['png','jpg','jpeg','gif','webp','svg']
  const mdExts = ['md','markdown']
  if (imgExts.includes(ext)) {
    // Inline image preview
    const existing = el.parentElement.querySelector('.file-preview')
    if (existing) { existing.remove(); return }
    const preview = document.createElement('div')
    preview.className = 'file-preview'
    preview.innerHTML = `<img src="file://${fp}" style="max-width:100%;max-height:400px;border-radius:6px;margin-top:8px">`
    el.parentElement.appendChild(preview)
  } else if (mdExts.includes(ext)) {
    const content = await window.api.readFile(fp)
    if (!content) { window.api.openFile(fp); return }
    const existing = el.parentElement.querySelector('.file-preview')
    if (existing) { existing.remove(); return }
    const preview = document.createElement('div')
    preview.className = 'file-preview'
    preview.style.cssText = 'background:#111;border-radius:8px;padding:12px;margin-top:8px;max-height:400px;overflow:auto'
    preview.innerHTML = marked.parse(content)
    el.parentElement.appendChild(preview)
  } else {
    window.api.openFile(fp)
  }
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

// File attachments
let pendingFiles = []
function handleFiles(fileList) {
  for (const f of fileList) {
    const reader = new FileReader()
    reader.onload = () => {
      pendingFiles.push({ name: f.name, type: f.type, data: reader.result })
      renderAttachPreview()
    }
    reader.readAsDataURL(f)
  }
  document.getElementById('fileInput').value = ''
}
function renderAttachPreview() {
  const el = document.getElementById('attachPreview')
  el.style.display = pendingFiles.length ? 'flex' : 'none'
  el.innerHTML = pendingFiles.map((f, i) => {
    const isImg = f.type.startsWith('image/')
    const preview = isImg ? `<img src="${f.data}">` : '📄'
    return `<div class="attach-chip">${preview}<span>${esc(f.name)}</span><span class="remove" onclick="removeAttach(${i})">✕</span></div>`
  }).join('')
}
function removeAttach(i) { pendingFiles.splice(i, 1); renderAttachPreview() }

// Drag & drop
document.addEventListener('dragover', e => e.preventDefault())
document.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files) })

async function send() {
  const text = input.value.trim()
  if (!text && !pendingFiles.length) return

  input.value = ''
  input.style.height = 'auto'
  const files = [...pendingFiles]
  pendingFiles = []
  renderAttachPreview()

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

  // Show user message with attachments
  const attachHtml = files.map(f => f.type.startsWith('image/') ? `<img src="${f.data}" style="max-height:120px;border-radius:6px;margin-top:4px">` : `<div class="attach-chip">📄 ${esc(f.name)}</div>`).join('')
  addCard('user', text + (attachHtml ? `<div>${attachHtml}</div>` : ''), 'You', true)

  const card = document.createElement('div')
  card.className = 'msg-card assistant'
  const _t = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
  card.innerHTML = `<div class="msg-avatar">🤖</div><div class="msg-body"><div class="msg-header"><span class="msg-name">${esc(targetAgentName)}</span><span class="msg-time">${_t}</span></div><div class="msg-content md-content"><span class="typing-indicator">思考中…</span></div><div class="tool-group-slot"></div></div>`
  messages.appendChild(card)
  const contentEl = card.querySelector('.md-content')
  const toolSlot = card.querySelector('.tool-group-slot')
  let fullText = ''
  let myToolSteps = []
  // Get requestId synchronously BEFORE chat() so filtering is ready
  const myRequestId = await window.api.chatPrepare()

  // Add per-card status line
  const statusLine = document.createElement('div')
  statusLine.className = 'card-status-line'
  statusLine.innerHTML = '<span class="card-status-dot thinking"></span><span class="card-status-text">思考中…</span>'
  card.querySelector('.msg-body').appendChild(statusLine)

  // Register handlers in the event bus
  requestHandlers.set(myRequestId, {
    onToken(d) {
      const t = typeof d === 'string' ? d : d.text
      if (!t) return
      fullText += t
      contentEl.innerHTML = marked.parse(fullText)
      messages.scrollTop = messages.scrollHeight
    },
    onToolStep(d) {
      myToolSteps.push({ name: d.name, output: String(d.output).slice(0, 120) })
      renderToolGroup(toolSlot, myToolSteps)
    },
    onStatus(level, text) {
      const dot = statusLine.querySelector('.card-status-dot')
      const txt = statusLine.querySelector('.card-status-text')
      if (dot) dot.className = `card-status-dot ${level}`
      if (txt) txt.textContent = text || ''
      if (level === 'done') {
        setTimeout(() => { statusLine.style.display = 'none' }, 2000)
      } else {
        statusLine.style.display = ''
      }
    }
  })

  try {
    const result = await window.api.chat({ prompt: text, history, agentId: targetAgentId, files })
    console.log('[Paw] chat result:', JSON.stringify({ answer: (result?.answer || '').slice(0, 100), fullText: fullText.slice(0, 100) }))
    // Use streaming fullText (already rendered by onToken) — don't overwrite with result.answer
    // which may contain intermediate round fragments
    const finalText = fullText || result?.answer || ''
    if (finalText.trim()) {
      contentEl.innerHTML = linkifyPaths(marked.parse(finalText))
    } else {
      contentEl.innerHTML = '<span style="color:#666;font-style:italic">（无文本回复）</span>'
    }
    // Clean up event bus, collapse tool steps on completion
    requestHandlers.delete(myRequestId)
    if (myToolSteps.length) renderToolGroup(toolSlot, myToolSteps, true)
    // Mark card status as done
    const sDot = statusLine.querySelector('.card-status-dot')
    const sTxt = statusLine.querySelector('.card-status-text')
    if (sDot) sDot.className = 'card-status-dot done'
    if (sTxt) sTxt.textContent = '已完成'
    setTimeout(() => { statusLine.style.display = 'none' }, 2000)
    history.push({ prompt: text, answer: finalText })
    // Persist to session
    if (currentSessionId) {
      const s = await window.api.loadSession(currentSessionId)
      if (s) {
        s.messages.push(
          { role: 'user', content: text, sender: 'You' },
          { role: 'assistant', content: finalText, sender: targetAgentName }
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

  input.focus()
}

function addCard(role, content, sender, rawHtml) {
  const card = document.createElement('div')
  card.className = `msg-card ${role}`
  const avatar = role === 'user' ? '👤' : '🤖'
  const nameClass = role === 'user' ? 'msg-name user-name' : 'msg-name'
  const time = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})

  if (role === 'error') {
    card.innerHTML = `<div class="msg-avatar">⚠️</div><div class="msg-body"><div class="msg-content" style="color:#ef4444">${esc(content)}</div></div>`
  } else if (role === 'user') {
    const body = rawHtml ? content : esc(content)
    card.innerHTML = `<div class="msg-avatar">${avatar}</div><div class="msg-body"><div class="msg-header"><span class="${nameClass}">${esc(sender||'You')}</span><span class="msg-time">${time}</span></div><div class="msg-content">${body}</div></div>`
  } else {
    card.innerHTML = `<div class="msg-avatar">${avatar}</div><div class="msg-body"><div class="msg-header"><span class="${nameClass}">${esc(sender||'Assistant')}</span><span class="msg-time">${time}</span></div><div class="msg-content md-content">${marked.parse(content||'')}</div></div>`
  }

  messages.appendChild(card)
  messages.scrollTop = messages.scrollHeight
}

function renderToolGroup(slot, steps, forceCollapse) {
  if (!steps.length) return
  slot.innerHTML = ''
  const group = document.createElement('div')
  group.className = 'tool-group-live'
  // During streaming: expand so user sees progress. After done / forceCollapse: collapse.
  const userToggled = slot.dataset.userToggled === 'true'
  const expanded = forceCollapse ? false : (userToggled ? slot.dataset.expanded === 'true' : true)
  group.innerHTML = `<div class="tool-group-header">🔧 <span class="tool-count">${steps.length}</span> 个工具调用 <span class="tool-expand">${expanded ? '▼' : '▶'}</span></div><div class="tool-group-body" style="display:${expanded ? 'block' : 'none'}"></div>`
  group.querySelector('.tool-group-header').onclick = () => {
    const body = group.querySelector('.tool-group-body')
    const arrow = group.querySelector('.tool-expand')
    const show = body.style.display === 'none'
    body.style.display = show ? 'block' : 'none'
    arrow.textContent = show ? '▼' : '▶'
    slot.dataset.expanded = show ? 'true' : 'false'
    slot.dataset.userToggled = 'true'
  }
  const body = group.querySelector('.tool-group-body')
  for (const s of steps) {
    const item = document.createElement('div')
    item.className = 'tool-step-item'
    item.innerHTML = `<span class="tool-step-name">${esc(s.name)}</span> <span class="tool-step-output">${esc(s.output.slice(0, 80))}</span>`
    body.appendChild(item)
  }
  slot.appendChild(group)
  messages.scrollTop = messages.scrollHeight
}

// addToolCard removed — tool steps now render inline via renderToolGroup

function linkifyPaths(html) {
  return html.replace(/(?<![="'])(\/([\w./-]+\/)+[\w.-]+\.\w+)/g, (m) => {
    return `<a href="#" class="file-link" data-path="${m}" title="Click to open">${m}</a>`
  })
}

function collapseToolSteps() {
  // Tool steps now render inline per-card via tool-group-slot; nothing to collapse globally
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
  document.getElementById('cfgHeartbeat').checked = config.heartbeat?.enabled || false
  document.getElementById('cfgHeartbeatInterval').value = config.heartbeat?.intervalMinutes || 30
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
    heartbeat: {
      enabled: document.getElementById('cfgHeartbeat').checked,
      intervalMinutes: parseInt(document.getElementById('cfgHeartbeatInterval').value) || 30,
    },
  }
  await window.api.saveConfig(config)
  if (config.heartbeat.enabled) await window.api.heartbeatStart()
  else await window.api.heartbeatStop()
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
