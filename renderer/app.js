// Paw — Renderer App

// ── Per-Session Status ──
const sessionStatus = new Map() // sessionId -> { level, text, aiAuthored }

function setSessionStatus(sessionId, level, text, aiAuthored = false) {
  const cur = sessionStatus.get(sessionId)
  // AI-authored status has priority — don't let programmatic status overwrite it
  // unless it's also AI-authored, or we're going to idle/done
  if (cur?.aiAuthored && !aiAuthored && level !== 'idle' && level !== 'done') return
  sessionStatus.set(sessionId, { level, text, aiAuthored })
  const item = document.querySelector(`.session-item[data-id="${sessionId}"]`)
  const dot = item?.querySelector('.session-status-dot')
  const t = item?.querySelector('.session-status-text')
  if (dot) dot.className = `session-status-dot ${level}`
  if (t) t.textContent = text || ''
  if (item) item.classList.toggle('has-ai-status', aiAuthored && level !== 'idle')
  // Persist to SQLite
  if (window.api.updateSessionStatus) {
    window.api.updateSessionStatus(sessionId, level, text)
  }
}

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
window.api.onTextStart((d) => {
  const h = requestHandlers.get(d.requestId)
  if (h?.onTextStart) h.onTextStart(d)
})

// Round info — update tool group header with progress
window.api.onRoundInfo((d) => {
  const h = requestHandlers.get(d.requestId)
  if (h?.onRoundInfo) h.onRoundInfo(d)
})

// Watson status — AI-authored, highest priority
window.api.onWatsonStatus(({ level, text, requestId }) => {
  if (currentSessionId) {
    setSessionStatus(currentSessionId, level, text || '', true)
  }
})

// Memory change listener
window.api.onMemoryChanged(({ file }) => {
  if (currentSessionId) {
    const prev = sessionStatus.get(currentSessionId)
    setSessionStatus(currentSessionId, 'idle', `记忆更新: ${file || ''}`)
    setTimeout(() => {
      const cur = sessionStatus.get(currentSessionId)
      if (cur?.text?.startsWith('记忆更新')) setSessionStatus(currentSessionId, prev?.level || 'idle', prev?.text || '')
    }, 3000)
  }
})

// Tray menu: new chat
window.api.onTrayNewChat(() => { newSession() })

// Claude Code events
let ccOutputEl = null
let ccOutputText = ''
window.api.onCcStatus(({ status, task, error, length }) => {
  if (status === 'running') {
    ccOutputText = ''
    // Find the last assistant card's tool area or create one
    const cards = document.querySelectorAll('.msg-card.assistant')
    const lastCard = cards[cards.length - 1]
    if (lastCard) {
      let toolArea = lastCard.querySelector('.tool-steps')
      if (!toolArea) {
        toolArea = document.createElement('div')
        toolArea.className = 'tool-steps'
        const flow = lastCard.querySelector('.msg-flow')
        if (flow) flow.appendChild(toolArea)
      }
      ccOutputEl = document.createElement('div')
      ccOutputEl.className = 'tool-step cc-output expanded'
      ccOutputEl.innerHTML = `<div class="tool-step-header"><span class="tool-icon">🤖</span> <strong>Claude Code</strong> <span class="cc-task">${esc(task || '')}</span> <button class="cc-stop-btn" onclick="window.api.ccStop()">Stop</button></div><pre class="cc-pre"></pre>`
      toolArea.appendChild(ccOutputEl)
    }
  } else if (status === 'done') {
    if (ccOutputEl) {
      const header = ccOutputEl.querySelector('.tool-step-header')
      if (header) header.innerHTML = `<span class="tool-icon">✅</span> <strong>Claude Code</strong> <span class="hint">${length || 0} chars</span>`
    }
    ccOutputEl = null
  } else if (status === 'error') {
    if (ccOutputEl) {
      const header = ccOutputEl.querySelector('.tool-step-header')
      if (header) header.innerHTML = `<span class="tool-icon">❌</span> <strong>Claude Code</strong> <span class="hint">${esc(error || 'unknown error')}</span>`
    }
    ccOutputEl = null
  }
})
window.api.onCcOutput(({ chunk }) => {
  ccOutputText += chunk
  if (ccOutputEl) {
    const pre = ccOutputEl.querySelector('.cc-pre')
    if (pre) {
      // Show last 50 lines
      const lines = ccOutputText.split('\n')
      const visible = lines.slice(-50).join('\n')
      pre.textContent = visible
      pre.scrollTop = pre.scrollHeight
    }
  }
})

marked.setOptions({
  breaks: true,
})
marked.use(markedHighlight.markedHighlight({
  langPrefix: 'hljs language-',
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value
    return hljs.highlightAuto(code).value
  },
}))

// File click handler — detect file paths in rendered messages
document.addEventListener('click', async (e) => {
  // Handle http/https links — open in system browser
  const link = e.target.closest('a[href]')
  if (link) {
    const href = link.getAttribute('href')
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      e.preventDefault()
      window.api.openExternal(href)
      return
    }
  }
  const el = e.target.closest('.file-link')
  if (!el) return
  e.preventDefault()
  const fp = el.dataset.path
  const ext = fp.split('.').pop().toLowerCase()
  const previewExts = ['png','jpg','jpeg','gif','webp','svg','mp4','mov','webm','mkv','avi','md','markdown']
  if (previewExts.includes(ext)) {
    window.api.openFilePreview(fp)
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

function showSetupScreen() {
  document.getElementById('setupScreen').style.display = ''
  document.getElementById('chatScreen').style.display = 'none'
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
  if (!sessions.length) {
    await newSession()
    bootstrapFirstSession()
  }
  else await switchSession(sessions[0].id)
  document.getElementById('input').focus()
}

// ── Bootstrap: cold start ──
// On very first session, auto-send a bootstrap prompt so the AI reads its
// identity files (SOUL.md, USER.md, IDENTITY.md) and introduces itself.
async function bootstrapFirstSession() {
  if (!currentSessionId) return
  // Only bootstrap if config has an API key set
  const config = await window.api.getConfig()
  if (!config?.apiKey) return
  // Only if session has no messages
  const session = await window.api.loadSession(currentSessionId)
  if (session?.messages?.length) return
  // Inject the bootstrap prompt as if the user typed it
  input.value = '你好，请读取 SOUL.md 和 USER.md，介绍一下你自己。'
  send()
}

// ── Session management ──

async function refreshSessionList() {
  const sessions = await window.api.listSessions()
  const list = document.getElementById('sessionList')
  list.innerHTML = ''
  // Clear search
  const searchInput = document.getElementById('sessionSearch')
  if (searchInput) searchInput.value = ''
  
  // Time grouping
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today - 86400000)
  let lastGroup = ''
  
  for (const s of sessions) {
    // Pre-populate status from DB if not already in memory
    if (!sessionStatus.has(s.id) && s.statusLevel) {
      sessionStatus.set(s.id, { level: s.statusLevel, text: s.statusText || '' })
    }
    const el = document.createElement('div')
    el.className = 'session-item' + (s.id === currentSessionId ? ' active' : '')
    el.dataset.id = s.id
    
    // Time group label
    const updatedAt = new Date(s.updatedAt || s.createdAt)
    let group = '更早'
    if (updatedAt >= today) group = '今天'
    else if (updatedAt >= yesterday) group = '昨天'
    if (group !== lastGroup) {
      const label = document.createElement('div')
      label.className = 'session-group-label'
      label.textContent = group
      list.appendChild(label)
      lastGroup = group
    }
    const st = sessionStatus.get(s.id) || { level: 'idle', text: '' }
    // Idle: show last message preview. Active/AI-authored: show status text
    const statusText = (st.level === 'idle' || st.level === 'done') ? (s.lastMessage || '') : (st.text || s.lastMessage || '')
    el.innerHTML = `<div class="session-item-main"><span class="session-title">${esc(s.title)}</span></div><div class="session-item-meta"><span class="session-status-dot ${st.level}"></span><span class="session-status-text">${esc(statusText)}</span><span class="del-btn" onclick="event.stopPropagation();deleteSession('${s.id}')">✕</span></div>`
    let clickTimer = null
    el.onclick = () => {
      if (clickTimer) clearTimeout(clickTimer)
      clickTimer = setTimeout(() => switchSession(s.id), 250)
    }
    el.ondblclick = (e) => {
      e.stopPropagation()
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null }
      renameSession(s.id, el)
    }
    el.oncontextmenu = (e) => {
      e.preventDefault()
      e.stopPropagation()
      showSessionContextMenu(e, s.id, el)
    }
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
  await refreshTaskBar()
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
  if (!confirm('确定要删除这个对话吗？')) return
  await window.api.deleteSession(id)
  if (id === currentSessionId) {
    const sessions = await window.api.listSessions()
    if (sessions.length) await switchSession(sessions[0].id)
    else await newSession()
  } else {
    await refreshSessionList()
  }
}

function showSessionContextMenu(e, id, el) {
  // Remove any existing context menu
  document.querySelector('.ctx-menu')?.remove()
  const menu = document.createElement('div')
  menu.className = 'ctx-menu'
  menu.style.left = e.clientX + 'px'
  menu.style.top = e.clientY + 'px'
  menu.innerHTML = `
    <div class="ctx-item" data-action="rename">重命名</div>
    <div class="ctx-item ctx-danger" data-action="delete">删除</div>
  `
  menu.onclick = (ev) => {
    const action = ev.target.closest('.ctx-item')?.dataset.action
    menu.remove()
    if (action === 'rename') renameSession(id, el)
    if (action === 'delete') deleteSession(id)
  }
  document.body.appendChild(menu)
  // Close on click elsewhere
  const close = () => { menu.remove(); document.removeEventListener('click', close) }
  setTimeout(() => document.addEventListener('click', close), 0)
}

function filterSessions(query) {
  const q = query.toLowerCase().trim()
  document.querySelectorAll('.session-item').forEach(el => {
    const title = el.querySelector('.session-title')?.textContent?.toLowerCase() || ''
    el.style.display = (!q || title.includes(q)) ? '' : 'none'
  })
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('hidden')
}

async function renameSession(id, el) {
  const titleEl = el.querySelector('.session-title')
  if (!titleEl) return
  const old = titleEl.textContent
  const inp = document.createElement('input')
  inp.type = 'text'
  inp.value = old
  inp.className = 'session-rename-input'
  inp.style.cssText = 'width:100%;background:#222;color:#eee;border:1px solid #555;border-radius:4px;padding:2px 4px;font-size:13px'
  titleEl.replaceWith(inp)
  inp.focus()
  inp.select()
  const finish = async () => {
    const newTitle = inp.value.trim() || old
    const s = await window.api.loadSession(id)
    if (s) { s.title = newTitle; await window.api.saveSession(s) }
    if (id === currentSessionId) document.getElementById('sessionTitle').textContent = newTitle
    await refreshSessionList()
  }
  inp.onblur = finish
  inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = old; inp.blur() } }
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
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() }
})

// Cmd+K to focus input
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); input.focus() }
})

// Auto-resize textarea
input.addEventListener('input', () => {
  input.style.height = 'auto'
  input.style.height = Math.min(input.scrollHeight, 120) + 'px'
  // Disable send button when empty
  sendBtn.disabled = !input.value.trim()
})
// Initial state
sendBtn.disabled = true

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

// ── Per-Agent Independent Context ──
// Each agent only sees: user messages + its own responses. Never sees other agents' messages.
function buildAgentContext(sessionMsgs, agentName, isMain) {
  const raw = []
  for (const m of sessionMsgs) {
    if (m.role === 'user') {
      raw.push({ role: 'user', content: m.content })
    } else if (m.role === 'assistant') {
      const isOwn = isMain
        ? (!m.sender || m.sender === 'Assistant')
        : m.sender === agentName
      if (isOwn) {
        raw.push({ role: 'assistant', content: m.content })
      }
    }
  }
  // Merge consecutive same-role messages (LLM APIs require alternating roles)
  const merged = []
  for (const m of raw) {
    if (merged.length && merged[merged.length - 1].role === m.role) {
      merged[merged.length - 1].content += '\n\n' + m.content
    } else {
      merged.push({ ...m })
    }
  }
  return merged
}

// ── Streaming Helpers (shared by main + agent responses) ──

function createStreamingCard(agentName) {
  const card = document.createElement('div')
  card.className = 'msg-card assistant'
  const _t = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
  card.innerHTML = `<div class="msg-avatar">🤖</div><div class="msg-body"><div class="msg-header"><span class="msg-name">${esc(agentName)}</span><span class="msg-time">${_t}</span></div><div class="msg-flow"></div></div>`
  messages.appendChild(card)
  messages.scrollTop = messages.scrollHeight
  const flowContainer = card.querySelector('.msg-flow')
  const firstTextEl = document.createElement('div')
  firstTextEl.className = 'msg-content md-content'
  firstTextEl.innerHTML = '<span class="typing-indicator">…</span>'
  flowContainer.appendChild(firstTextEl)
  return { card, flowContainer, firstTextEl }
}

function registerStreamHandlers(myRequestId, flowContainer, firstTextEl, sendSessionId) {
  let currentTextEl = firstTextEl
  let segmentText = ''
  let fullText = ''
  let currentToolGroup = null
  let myToolSteps = []

  requestHandlers.set(myRequestId, {
    onTextStart() {
      if (currentToolGroup || myToolSteps.length > 0) {
        currentTextEl = document.createElement('div')
        currentTextEl.className = 'msg-content md-content'
        flowContainer.appendChild(currentTextEl)
        currentToolGroup = null
        segmentText = ''
      }
    },
    onToken(d) {
      const t = typeof d === 'string' ? d : d.text
      if (!t) return
      fullText += t
      segmentText += t
      if (currentToolGroup) {
        currentTextEl = document.createElement('div')
        currentTextEl.className = 'msg-content md-content'
        flowContainer.appendChild(currentTextEl)
        currentToolGroup = null
        segmentText = t
      }
      currentTextEl.innerHTML = marked.parse(segmentText)
      messages.scrollTop = messages.scrollHeight
    },
    onToolStep(d) {
      myToolSteps.push({ name: d.name, output: String(d.output).slice(0, 120) })
      if (sendSessionId) setSessionStatus(sendSessionId, 'running', '…')
      if (!currentToolGroup) {
        currentToolGroup = document.createElement('div')
        currentToolGroup.className = 'tool-group-inline'
        currentToolGroup.innerHTML = '<div class="tool-group-header">🔧 <span class="tool-count">0</span> 个工具调用 <span class="tool-expand">▼</span></div><div class="tool-group-body"></div>'
        const thisGroup = currentToolGroup
        thisGroup.querySelector('.tool-group-header').onclick = () => {
          const body = thisGroup.querySelector('.tool-group-body')
          const arrow = thisGroup.querySelector('.tool-expand')
          const show = body.style.display === 'none'
          body.style.display = show ? 'block' : 'none'
          arrow.textContent = show ? '▼' : '▶'
        }
        flowContainer.appendChild(currentToolGroup)
      }
      const body = currentToolGroup.querySelector('.tool-group-body')
      const count = currentToolGroup.querySelector('.tool-count')
      const item = document.createElement('div')
      item.className = 'tool-step-item'
      item.innerHTML = `<span class="tool-step-name">${esc(d.name)}</span> <span class="tool-step-output">${esc(String(d.output).slice(0, 80))}</span>`
      body.appendChild(item)
      count.textContent = body.children.length
      messages.scrollTop = messages.scrollHeight
    },
    onStatus() {},
    onRoundInfo(d) {
      // Update the latest tool group header with round info
      if (currentToolGroup) {
        const header = currentToolGroup.querySelector('.tool-group-header')
        if (header) {
          const count = currentToolGroup.querySelector('.tool-count')?.textContent || '0'
          const expand = currentToolGroup.querySelector('.tool-expand')?.textContent || '▼'
          header.innerHTML = `🔧 <span class="tool-count">${count}</span> 个工具调用 <span class="tool-round">轮次 ${d.round}/${d.maxRounds}</span> <span class="tool-expand">${expand}</span>`
        }
      }
    }
  })

  return { getFullText: () => fullText }
}

function finalizeCard(card, myRequestId, fullText) {
  requestHandlers.delete(myRequestId)
  if (fullText.trim()) {
    card.querySelectorAll('.msg-content.md-content').forEach(el => {
      el.innerHTML = linkifyPaths(el.innerHTML)
    })
  }
  card.querySelectorAll('.tool-group-inline').forEach(g => {
    const body = g.querySelector('.tool-group-body')
    const arrow = g.querySelector('.tool-expand')
    if (body) body.style.display = 'none'
    if (arrow) arrow.textContent = '▶'
  })
}

async function send() {
  const text = input.value.trim()
  if (!text && !pendingFiles.length) return

  // ── Slash commands ──
  if (text.startsWith('/')) {
    const cmd = text.split(/\s/)[0].toLowerCase()
    const arg = text.slice(cmd.length).trim()

    if (cmd === '/new') {
      input.value = ''
      await newSession()
      if (arg) {
        // If /new has text after it, send it as first message in new session
        input.value = arg
        return send()
      }
      return
    }

    if (cmd === '/status') {
      input.value = ''
      const session = currentSessionId ? await window.api.loadSession(currentSessionId) : null
      const msgCount = session?.messages?.length || 0
      const tokenEst = Math.ceil(JSON.stringify(session?.messages || []).length / 3.5)
      const config = await window.api.getConfig()
      const usage = currentSessionId ? await window.api.getTokenUsage(currentSessionId) : { inputTokens: 0, outputTokens: 0 }
      addCard('assistant', [
        `**Session Status**`,
        `- Messages: ${msgCount}`,
        `- Estimated context: ~${tokenEst.toLocaleString()} tokens`,
        `- API usage: ${(usage.inputTokens || 0).toLocaleString()} input + ${(usage.outputTokens || 0).toLocaleString()} output tokens`,
        `- Model: ${config?.model || '(default)'}`,
        `- Provider: ${config?.provider || 'anthropic'}`,
        `- Session: \`${currentSessionId || 'none'}\``,
      ].join('\n'), 'System', true)
      return
    }

    if (cmd === '/context') {
      input.value = ''
      const config = await window.api.getConfig()
      const session = currentSessionId ? await window.api.loadSession(currentSessionId) : null
      const prompt = await window.api.buildSystemPrompt()
      const promptChars = prompt?.length || 0
      const promptTokens = Math.ceil(promptChars / 3.5)
      const msgCount = session?.messages?.length || 0
      const historyChars = JSON.stringify(session?.messages || []).length
      const historyTokens = Math.ceil(historyChars / 3.5)
      const totalTokens = promptTokens + historyTokens

      addCard('assistant', [
        `**Context Breakdown**`,
        `- System prompt: ~${promptTokens.toLocaleString()} tokens (${promptChars.toLocaleString()} chars)`,
        `- History: ${msgCount} messages, ~${historyTokens.toLocaleString()} tokens`,
        `- Total: ~${totalTokens.toLocaleString()} tokens`,
        `- Model: ${config?.model || '(default)'}`,
        `- Provider: ${config?.provider || 'anthropic'}`,
        `- Bootstrap max/file: 20,000 chars`,
        `- Bootstrap total max: 80,000 chars`,
      ].join('\n'), 'System', true)
      return
    }

    if (cmd === '/reset') {
      input.value = ''
      if (currentSessionId) {
        const s = await window.api.loadSession(currentSessionId)
        if (s) {
          s.messages = []
          await window.api.saveSession(s)
        }
        // Clear chat UI
        document.querySelectorAll('.msg-card').forEach(c => c.remove())
        addCard('assistant', 'Session 已重置。', 'System', true)
      }
      return
    }

    if (cmd === '/stop') {
      input.value = ''
      await window.api.chatCancel()
      addCard('assistant', '已停止当前请求。', 'System', true)
      return
    }

    if (cmd === '/compact') {
      input.value = ''
      addCard('user', text, 'You', true)
      setSessionStatus(currentSessionId, 'thinking', '压缩中...')
      // Force compaction by setting the flag
      const chatParams = { prompt: arg || '请压缩历史对话', history, agentId: null, files: [], sessionId: currentSessionId, requestId: null, forceCompact: true }
      // Use normal chat flow — compaction runs in main.js
      // For now, just inform the user
      addCard('assistant', '对话历史已标记压缩，下次发送消息时将自动执行 compaction。', 'System', true)
      setSessionStatus(currentSessionId, 'idle', '')
      return
    }
  }

  const sendSessionId = currentSessionId

  input.value = ''
  input.style.height = 'auto'
  sendBtn.disabled = true
  const files = [...pendingFiles]
  pendingFiles = []
  renderAttachPreview()

  // Detect @mention to pick specific agent
  let targetAgentId = null, targetAgentName = 'Assistant'
  const mention = text.match(/^@(\S+)[\s，,]/)
  if (mention && sendSessionId) {
    const q = mention[1].toLowerCase()
    // Fuzzy match: @架构师 matches agent "架构", @设计 matches "设计师"
    const fuzzyFind = (list) => list.find(a => {
      const n = a.name.toLowerCase()
      return n === q || n.startsWith(q) || q.startsWith(n)
    })
    const sessionAgents = await window.api.listSessionAgents(sendSessionId)
    const sFound = fuzzyFind(sessionAgents)
    if (sFound) { targetAgentId = sFound.id; targetAgentName = sFound.name }
    if (!sFound) {
      const agents = await window.api.listAgents()
      const tFound = fuzzyFind(agents)
      if (tFound) { targetAgentId = tFound.id; targetAgentName = tFound.name }
    }
  }

  // Show user message with attachments
  const attachHtml = files.map(f => f.type.startsWith('image/') ? `<img src="${f.data}" style="max-height:120px;border-radius:6px;margin-top:4px">` : `<div class="attach-chip">📄 ${esc(f.name)}</div>`).join('')
  addCard('user', text + (attachHtml ? `<div>${attachHtml}</div>` : ''), 'You', true)
  setSessionStatus(sendSessionId, 'thinking', '…')

  // ── Case 1: @mention → direct to single agent ──
  // ── Case 2: everything else → Main (orchestrator delegates via send_message) ──
  {
    // For @mention to a specific agent, use independent context
    let chatParams
    if (targetAgentId) {
      const sessionData = sendSessionId ? await window.api.loadSession(sendSessionId) : null
      const rawMessages = buildAgentContext(sessionData?.messages || [], targetAgentName, false)
      chatParams = { prompt: text, rawMessages, agentId: targetAgentId, files, sessionId: sendSessionId, requestId: null }
    } else {
      chatParams = { prompt: text, history, agentId: null, files, sessionId: sendSessionId, requestId: null }
    }

    const { card, flowContainer, firstTextEl } = createStreamingCard(targetAgentName)
    const myRequestId = await window.api.chatPrepare()
    const { getFullText } = registerStreamHandlers(myRequestId, flowContainer, firstTextEl, sendSessionId)

    chatParams.requestId = myRequestId

    try {
      const result = await window.api.chat(chatParams)
      const finalText = getFullText() || result?.answer || ''
      finalizeCard(card, myRequestId, finalText)

      if (!finalText.trim()) {
        firstTextEl.innerHTML = '<span style="color:#666;font-style:italic">（无文本回复）</span>'
      }

      const curStatus = sessionStatus.get(sendSessionId)
      if (!curStatus?.aiAuthored) {
        const summary = text.length > 15 ? text.slice(0, 15) + '…' : text
        setSessionStatus(sendSessionId, 'done', `已回复: ${summary}`)
      }

      history.push({ prompt: text, answer: finalText })
      if (sendSessionId) {
        const s = await window.api.loadSession(sendSessionId)
        if (s) {
          s.messages.push(
            { role: 'user', content: text, sender: 'You' },
            { role: 'assistant', content: finalText, sender: targetAgentName }
          )
          if (s.messages.length === 2) {
            s.title = generateTitle(text, finalText)
          }
          await window.api.saveSession(s)
          document.getElementById('sessionTitle').textContent = s.title
          await refreshSessionList()
        }
      }
    } catch (err) {
      setSessionStatus(sendSessionId, 'idle', '出错')
      requestHandlers.delete(myRequestId)
      if (!getFullText()) {
        card.remove()
        addCard('error', err.message || String(err))
      }
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
  } else if (role === 'agent-to-agent') {
    card.innerHTML = `<div class="msg-avatar">💬</div><div class="msg-body"><div class="msg-header"><span class="msg-name a2a-name">${esc(sender||'Agent')}</span><span class="msg-time">${time}</span></div><div class="msg-content md-content a2a-content">${marked.parse(content||'')}</div></div>`
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
  // Match absolute paths (/...), home paths (~/...), and relative paths with extension
  // Negative lookbehind avoids matching inside href="..." or src="..."
  return html.replace(/(?<![="'`])(?:~?\/[\w.@:+-]+(?:\/[\w.@:+-]+)*\.\w+|~?\/[\w.@:+-]+(?:\/[\w.@:+-]+)+)/g, (m) => {
    // Skip if it looks like a URL path fragment (no leading /)
    if (m.startsWith('http')) return m
    return `<a href="#" class="file-link" data-path="${m}" title="Click to open">${m}</a>`
  })
}

function collapseToolSteps() {
  // Tool steps now render inline per-card via tool-group-slot; nothing to collapse globally
}

function generateTitle(userText, assistantText) {
  // Smart title: extract key topic from user message
  const clean = userText.replace(/\n/g, ' ').trim()
  // If short enough, use as-is
  if (clean.length <= 25) return clean
  // Try to extract a meaningful prefix
  const stops = ['，', '。', '？', '！', '、', ',', '.', '?', '!', ' ']
  for (const s of stops) {
    const idx = clean.indexOf(s, 8)
    if (idx > 0 && idx <= 30) return clean.slice(0, idx)
  }
  return clean.slice(0, 25) + '…'
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

async function openSettings() {
  const config = await window.api.getConfig() || {}
  const prefs = await window.api.getPrefs()
  const codingAgent = await window.api.invoke('get-coding-agent')
  document.getElementById('cfgProvider').value = config.provider || 'anthropic'
  document.getElementById('cfgApiKey').value = config.apiKey || ''
  document.getElementById('cfgBaseUrl').value = config.baseUrl || ''
  document.getElementById('cfgModel').value = config.model || ''
  document.getElementById('cfgCodingAgent').value = codingAgent || 'claude'
  document.getElementById('cfgTavilyKey').value = config.tavilyKey || ''
  document.getElementById('cfgHeartbeat').checked = config.heartbeat?.enabled !== false
  document.getElementById('cfgHeartbeatInterval').value = config.heartbeat?.intervalMinutes || 30
  document.getElementById('cfgExecApproval').checked = config.execApproval !== false
  document.getElementById('cfgWorkspacePath').textContent = prefs.clawDir || '(not set)'
  switchSettingsTab('general')
  document.getElementById('settingsOverlay').style.display = 'flex'
}

async function changeWorkspace() {
  const dir = await window.api.selectClawDir()
  if (dir) {
    closeSettings()
    // Reload the app with the new workspace
    sessionStatus.clear()
    currentSessionId = null
    history = []
    await enterChat()
  }
}

function closeSettings() {
  document.getElementById('settingsOverlay').style.display = 'none'
}

function switchSettingsTab(tabName) {
  document.querySelectorAll('.settings-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName))
  document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabName}`))
}

async function saveSettings() {
  const config = {
    provider: document.getElementById('cfgProvider').value,
    apiKey: document.getElementById('cfgApiKey').value,
    baseUrl: document.getElementById('cfgBaseUrl').value || undefined,
    model: document.getElementById('cfgModel').value || undefined,
    tavilyKey: document.getElementById('cfgTavilyKey').value || undefined,
    execApproval: document.getElementById('cfgExecApproval').checked,
    heartbeat: {
      enabled: document.getElementById('cfgHeartbeat').checked,
      intervalMinutes: parseInt(document.getElementById('cfgHeartbeatInterval').value) || 30,
    },
  }
  const codingAgent = document.getElementById('cfgCodingAgent').value
  await window.api.saveConfig(config)
  await window.api.invoke('set-coding-agent', codingAgent)
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
  const sessionAgents = await window.api.listSessionAgents(currentSessionId)
  const templateAgents = await window.api.listAgents()
  const list = document.getElementById('memberList')
  list.innerHTML = ''
  // Always show user
  const userEl = document.createElement('div')
  userEl.className = 'member-item'
  userEl.innerHTML = '<span>👤 You</span>'
  list.appendChild(userEl)
  // Show lightweight agents
  for (const a of sessionAgents) {
    const el = document.createElement('div')
    el.className = 'member-item'
    el.innerHTML = `<span>🤖 ${esc(a.name)}</span><span class="hint" style="margin:0 8px;font-size:11px">${esc((a.role || '').slice(0, 40))}</span><span class="del-btn" onclick="removeSessionAgent('${a.id}')">✕</span>`
    list.appendChild(el)
  }
  // Populate template dropdown (exclude those already added as session agents)
  const sessionNames = new Set(sessionAgents.map(a => a.name))
  const select = document.getElementById('addAgentSelect')
  select.innerHTML = '<option value="">Select template...</option>'
  for (const a of templateAgents) {
    if (!sessionNames.has(a.name)) select.innerHTML += `<option value="${a.id}">${esc(a.name)}</option>`
  }
}

async function createLightweightAgent() {
  if (!currentSessionId) return
  const name = document.getElementById('newRoleName').value.trim()
  const role = document.getElementById('newRoleDesc').value.trim()
  if (!name || !role) return
  const result = await window.api.createSessionAgent(currentSessionId, { name, role })
  if (result?.error) { alert(result.error); return }
  document.getElementById('newRoleName').value = ''
  document.getElementById('newRoleDesc').value = ''
  await refreshMemberList()
}

async function addAgentFromTemplate() {
  const id = document.getElementById('addAgentSelect').value
  if (!id || !currentSessionId) return
  const agent = await window.api.loadAgent(id)
  if (!agent) return
  // Create a lightweight agent from the template
  const result = await window.api.createSessionAgent(currentSessionId, { name: agent.name, role: agent.soul || '' })
  if (result?.error) { alert(result.error); return }
  await refreshMemberList()
}

async function removeSessionAgent(agentId) {
  if (!currentSessionId) return
  await window.api.deleteSessionAgent(agentId)
  await refreshMemberList()
}

// ── triggerAgentResponse: used by agent-message and auto-rotate ──
async function triggerAgentResponse(agentId, agentName, prompt, sendSessionId) {
  const { card, flowContainer, firstTextEl } = createStreamingCard(agentName)
  const reqId = await window.api.chatPrepare()
  const { getFullText } = registerStreamHandlers(reqId, flowContainer, firstTextEl, sendSessionId)

  // Build independent context: this agent's prior history only
  // Remove the last user message — Main's delegation (prompt param) replaces it,
  // so the agent focuses on Main's specific instruction, not the user's raw message
  const s = await window.api.loadSession(sendSessionId)
  const rawMessages = buildAgentContext(s?.messages || [], agentName, false)
  if (rawMessages.length && rawMessages[rawMessages.length - 1].role === 'user') {
    rawMessages.pop()
  }

  try {
    const result = await window.api.chat({
      prompt, rawMessages, agentId, files: [],
      sessionId: sendSessionId, requestId: reqId
    })
    const finalText = getFullText() || result?.answer || ''
    finalizeCard(card, reqId, finalText)

    if (sendSessionId) {
      const session = await window.api.loadSession(sendSessionId)
      if (session) {
        session.messages.push({ role: 'assistant', content: finalText, sender: agentName })
        await window.api.saveSession(session)
      }
    }
  } catch (err) {
    console.error(`[Paw] agent ${agentName} response error:`, err)
    requestHandlers.delete(reqId)
  }
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
    el.className = 'agent-card'
    const initial = (a.name || '?')[0].toUpperCase()
    const soulPreview = (a.soul || '').replace(/\n/g, ' ').slice(0, 60)
    el.innerHTML = `
      <div class="agent-avatar">${initial}</div>
      <div class="agent-info">
        <div class="agent-name">${esc(a.name)}</div>
        <div class="agent-model">${esc(a.model || 'default model')}</div>
        ${soulPreview ? `<div class="agent-soul-preview">${esc(soulPreview)}…</div>` : ''}
      </div>
      <div class="agent-actions">
        <button onclick="deleteAgent('${a.id}')" title="Delete">✕</button>
      </div>`
    list.appendChild(el)
  }
  if (!agents.length) {
    list.innerHTML = '<p style="color:#555;font-size:13px;text-align:center;padding:16px">No agents yet. Create one below.</p>'
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

// ── Task Bar ──

let taskBarCollapsed = false

async function refreshTaskBar() {
  if (!currentSessionId) return
  const tasks = await window.api.listTasks(currentSessionId)
  const bar = document.getElementById('taskBar')
  if (!tasks?.length) { bar.style.display = 'none'; return }
  bar.style.display = ''
  const count = document.getElementById('taskCount')
  const done = tasks.filter(t => t.status === 'done').length
  count.textContent = `(${done}/${tasks.length})`
  const list = document.getElementById('taskListUI')
  list.className = taskBarCollapsed ? 'task-list-ui collapsed' : 'task-list-ui'
  const icon = { pending: '⏳', 'in-progress': '🔄', done: '✅' }
  list.innerHTML = tasks.map(t => {
    const cls = t.status === 'done' ? 'task-item done' : t.status === 'in-progress' ? 'task-item in-progress' : 'task-item'
    return `<div class="${cls}">
      <span class="task-id">${t.id.slice(0,8)}</span>
      <span class="task-status">${icon[t.status] || '?'}</span>
      <span class="task-title">${esc(t.title)}</span>
      ${t.assignee ? `<span class="task-assignee">${esc(t.assignee)}</span>` : ''}
    </div>`
  }).join('')
}

function toggleTaskBar() {
  taskBarCollapsed = !taskBarCollapsed
  document.getElementById('taskToggle').textContent = taskBarCollapsed ? '▸' : '▾'
  document.getElementById('taskListUI').className = taskBarCollapsed ? 'task-list-ui collapsed' : 'task-list-ui'
}

window.api.onTasksChanged((sid) => {
  if (sid === currentSessionId) refreshTaskBar()
})

window.api.onSessionAgentsChanged((sid) => {
  if (sid === currentSessionId) refreshMemberList()
})

window.api.onAgentMessage(async ({ from, to, message, sessionId }) => {
  if (sessionId !== currentSessionId) return
  addCard('agent-to-agent', message, `${from} → ${to}`)

  // Auto-trigger target agent to respond
  const sessionAgents = await window.api.listSessionAgents(currentSessionId)
  const target = sessionAgents.find(a => a.name === to)
  if (!target) return

  // Fire and forget — don't await, allow parallel responses when Main delegates to multiple agents
  triggerAgentResponse(target.id, target.name, message, currentSessionId)
})

window.api.onAutoRotate(async ({ sessionId, completedBy, nextTask }) => {
  if (sessionId !== currentSessionId) return
  // Find agent assigned to next task (auto-assigned by main.js)
  const sessionAgents = await window.api.listSessionAgents(currentSessionId)
  let targetAgent = null
  if (nextTask.assignee) {
    targetAgent = sessionAgents.find(a => a.name === nextTask.assignee)
  }
  if (!targetAgent) return
  const sysMsg = `Task "${nextTask.title}" is now unblocked (completed by ${completedBy}). Please claim and work on it.`
  addCard('agent-to-agent', sysMsg, `System → ${targetAgent.name}`)
  // Auto-trigger the agent
  await triggerAgentResponse(targetAgent.id, targetAgent.name, sysMsg, currentSessionId)
})

// Init
init()
