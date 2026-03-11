// Paw — Renderer App

// ── Icon constants (Lucide-style inline SVGs) ──
const IC = {
  wrench: '<span class="ic"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></span>',
  thought: '<span class="ic"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/></svg></span>',
  user: '<span class="ic"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>',
  warn: '<span class="ic"><svg viewBox="0 0 24 24" width="14" height="14"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>',
  chat: '<span class="ic"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/></svg></span>',
  edit: '<span class="ic"><svg viewBox="0 0 24 24" width="12" height="12"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></span>',
  folder: '<span class="ic"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>',
  spark: '<span class="ic"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg></span>',
  bot: '<span class="ic"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg></span>',
  check: '<span class="ic"><svg viewBox="0 0 24 24" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg></span>',
  cross: '<span class="ic"><svg viewBox="0 0 24 24" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>',
  clock: '<span class="ic"><svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>',
  refresh: '<span class="ic"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg></span>',
  dot_green: '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e"></span>',
  dot_red: '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444"></span>',
  file: '<span class="ic"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg></span>',
  group: '<span class="ic"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>',
}

// ── Tool humanization — AI-native action descriptions ──
const TOOL_ACTIONS = {
  file_read:      { verb: 'Read',       icon: '📄', argKey: 'path',    extract: v => v?.split('/').pop() },
  file_write:     { verb: 'Wrote',      icon: '✏️', argKey: 'path',    extract: v => v?.split('/').pop() },
  file_edit:      { verb: 'Edited',     icon: '✏️', argKey: 'path',    extract: v => v?.split('/').pop() },
  shell_exec:     { verb: 'Ran',        icon: '⚡', argKey: 'command', extract: v => v?.split('\n')[0]?.slice(0, 40) },
  code_exec:      { verb: 'Ran code',   icon: '⚡' },
  process:        { verb: 'Ran process',icon: '⚡' },
  web_fetch:      { verb: 'Fetched',    icon: '🌐', argKey: 'url',     extract: v => { try { return new URL(v).hostname } catch { return v?.slice(0, 30) } } },
  search:         { verb: 'Searched',   icon: '🔍', argKey: 'query',   extract: v => v?.slice(0, 40) },
  memory_search:  { verb: 'Recalled',   icon: '🧠', argKey: 'query',   extract: v => v?.slice(0, 30) },
  memory_get:     { verb: 'Recalled',   icon: '🧠' },
  send_message:   { verb: 'Messaged',   icon: '💬', argKey: 'to',      extract: v => v },
  delegate_to:    { verb: 'Delegated to', icon: '🤝', argKey: 'agent', extract: v => v },
  create_agent:   { verb: 'Created agent', icon: '🤖' },
  remove_agent:   { verb: 'Removed agent', icon: '🤖' },
  task_create:    { verb: 'Created task',  icon: '📋' },
  task_update:    { verb: 'Updated task',  icon: '📋' },
  task_list:      { verb: 'Listed tasks',  icon: '📋' },
  skill_exec:     { verb: 'Used skill',    icon: '✨', argKey: 'name', extract: v => v },
  skill_create:   { verb: 'Created skill', icon: '✨' },
  skill_install:  { verb: 'Installed',     icon: '📦' },
  claude_code:    { verb: 'Coding',        icon: '💻' },
  cron:           { verb: 'Scheduled',     icon: '⏰' },
  notify:         { verb: 'Notified',      icon: '🔔' },
  mcp_config:     { verb: 'Configured MCP',icon: '🔌' },
  ui_status_set:  { verb: 'Updated status',icon: '📊', hidden: true },
  stay_silent:    { verb: 'Listening',     icon: '🤫', hidden: true },
}

function humanizeToolStep(name, input) {
  const action = TOOL_ACTIONS[name]
  if (!action) return { text: name, icon: '🔧' }
  // Extract a meaningful target from the tool input args
  let target = ''
  if (action.argKey && input) {
    const src = typeof input === 'object' ? input : (() => { try { return JSON.parse(input) } catch { return null } })()
    if (src) {
      const raw = src[action.argKey]
      target = raw ? (action.extract ? action.extract(raw) : String(raw)) : ''
    }
    if (!target && typeof input === 'string' && input.length < 200) {
      // Fallback: try regex extraction from short strings (likely input, not output)
      if (action.argKey === 'path') {
        const m = input.match(/[\w.-]+\.\w{1,10}/)
        if (m) target = m[0]
      } else if (action.argKey === 'command') {
        target = input.split('\n')[0].slice(0, 40)
      }
      // Don't use output as query — it's the result, not the input
    }
  }
  return { text: target ? `${action.verb} ${target}` : action.verb, icon: action.icon, hidden: action.hidden }
}

function summarizeToolSteps(steps) {
  // F204: Group by action type and count occurrences
  const typeCounts = {}
  for (const s of steps) {
    const h = humanizeToolStep(s.name, s.input)
    if (h.hidden) continue
    const verb = h.text.split(' ')[0] // Extract verb (Read, Wrote, etc.)
    typeCounts[verb] = (typeCounts[verb] || 0) + 1
  }

  const types = Object.keys(typeCounts)
  if (!types.length) return null

  // Build one-sentence summary
  const parts = types.slice(0, 3).map(verb => {
    const count = typeCounts[verb]
    if (verb === 'Read' || verb === 'Edited' || verb === 'Wrote') {
      return count > 1 ? `${verb.toLowerCase()} ${count} files` : `${verb.toLowerCase()} 1 file`
    }
    return count > 1 ? `${verb.toLowerCase()} ${count} times` : verb.toLowerCase()
  })

  const summary = parts.join(', ').replace(/, ([^,]*)$/, ' and $1')
  return summary.charAt(0).toUpperCase() + summary.slice(1)
}

// ── Feature flags (loaded at init) ──
let _featureFlags = { legacyAgentFeatures: false }

// ── Per-Session Status (three-layer design) ──
// Layer 1: Activity dot — transient, not persisted, reflects real-time agent state
const activityState = new Map() // sessionId -> level ('idle'|'thinking'|'running'|'tool'|'done'|'need_you')
// Layer 2: AI status — persisted to SQLite, set by ui_status_set tool
const aiStatus = new Map()      // sessionId -> text ('' = none)

function setActivity(sessionId, level) {
  activityState.set(sessionId, level)
  const item = document.querySelector(`.session-item[data-id="${sessionId}"]`)
  if (!item) return
  const dot = item.querySelector('.session-dot')
  if (dot) {
    dot.className = `session-dot ${level}`
    dot.style.display = level === 'idle' ? 'none' : ''
  }
  // Update subtitle: active states show AI status text, idle/done show lastMsg
  _updateSubtitle(item, sessionId)
}

function setAiStatus(sessionId, text) {
  aiStatus.set(sessionId, text || '')
  const item = document.querySelector(`.session-item[data-id="${sessionId}"]`)
  if (item) _updateSubtitle(item, sessionId)
  // Persist AI status to SQLite
  if (window.api.updateSessionStatus) {
    window.api.updateSessionStatus(sessionId, activityState.get(sessionId) || 'idle', text || '')
  }
}

function _updateSubtitle(item, sessionId) {
  const sub = item?.querySelector('.session-subtitle')
  if (!sub) return
  const level = activityState.get(sessionId) || 'idle'
  const aiText = aiStatus.get(sessionId) || ''
  const isRunning = level === 'thinking' || level === 'running' || level === 'tool'
  if (isRunning) {
    sub.textContent = aiText || '思考中...'
    sub.classList.add('active-status')
  } else {
    sub.textContent = item.dataset.lastMsg || ''
    sub.classList.remove('active-status')
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

// Agent status — inline indicator at bottom of active streaming card
let _activeStatusEl = null  // the .inline-status element inside the streaming card
let _statusIsAiAuthored = false  // AI-authored text takes priority
function updateInlineStatus(text) {
  if (!_activeStatusEl) return
  _activeStatusEl.innerHTML = `<span class="reading-indicator"><span></span><span></span><span></span></span> ${esc(text || '')}`
}
window.api.onStatus(({ state, detail }) => {
  if (!_activeStatusEl) return
  if (state === 'done' || state === 'error') {
    _activeStatusEl.remove()
    _activeStatusEl = null
    _statusIsAiAuthored = false
  } else if (!_statusIsAiAuthored) {
    // Only show programmatic status if no AI-authored text is active
    updateInlineStatus(detail || '')
  }
})

// Watson status — AI-authored, drives AI status layer + inline indicator
window.api.onWatsonStatus(({ level, text, requestId, sessionId: evtSessionId }) => {
  // Use event's sessionId (session-scoped), fallback to current
  const targetSid = evtSessionId || currentSessionId
  if (targetSid) {
    setActivity(targetSid, level)
    setAiStatus(targetSid, text || '')
  }
  // Only update inline indicator if this is the currently displayed session
  if (targetSid === currentSessionId && _activeStatusEl && text) {
    _statusIsAiAuthored = true
    updateInlineStatus(text)
  }
})

// Memory change listener — temporary flash, doesn't touch AI status
window.api.onMemoryChanged(({ file }) => {
  // No-op for sidebar — memory changes don't affect status display
})

// Tray menu: new chat
window.api.onTrayNewChat(() => { newSession() })

// Global user profile — { userName, userAvatar, avatarAbsPath }
let _userProfile = { userName: '', userAvatar: '', avatarAbsPath: '' }

// Global workspace cache — refreshed on sidebar render + session load
let _wsCache = new Map()  // id → { id, path, identity }
let _avatarTs = Date.now()  // cache-bust timestamp for avatar images
function _updateWsCache(workspaces) {
  _wsCache = new Map()
  for (const ws of workspaces) _wsCache.set(ws.id, ws)
}
function _wsPath(wsId) { return _wsCache.get(wsId)?.path || '' }

// Group chat delegation streaming — independent bubbles
let _delegateState = null  // { card, textEl, fullText, sender, workspaceId }
let _pendingDelegateMessages = []  // accumulated delegate messages to save after orchestrator finishes
let _clawDir = ''  // workspace root for resolving relative paths
window.api.onDelegateStart(({ requestId, sender, workspaceId, avatar, sessionId: evtSid }) => {
  // Ignore delegate events from other sessions
  if (evtSid && evtSid !== currentSessionId) return
  console.log(`[delegate] START: sender=${sender}, avatar=${avatar}, wsId=${workspaceId}`)
  // Capture orchestrator info for later split (read from DOM name, resolve from wsCache)
  const lastCard = _msgContainer?.querySelector('.msg-card.assistant:last-of-type')
  const orchName = lastCard?.querySelector('.msg-name')?.textContent || 'Assistant'
  // Find orchestrator ws from cache by name match
  let orchAvatar = null, orchWsPath = null
  for (const [, ws] of _wsCache) {
    if (ws.identity?.name === orchName) {
      orchAvatar = ws.identity?.avatar || null
      orchWsPath = ws.path
      break
    }
  }
  const card = document.createElement('div')
  card.className = 'msg-card assistant'
  const _t = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
  card.innerHTML = `<div class="msg-avatar">${_renderAvatar(avatar, 'assistant', _wsPath(workspaceId))}</div><div class="msg-body"><div class="msg-header"><span class="msg-name">${esc(sender)}</span><span class="msg-time">${_t}</span></div><div class="msg-flow"><div class="msg-content md-content"></div><div class="inline-status"><span class="reading-indicator"><span></span><span></span><span></span></span> ${esc(sender)} thinking...</div></div></div>`
  _msgContainer?.appendChild(card) || messages.appendChild(card)
  messages.scrollTop = messages.scrollHeight
  const textEl = card.querySelector('.msg-content.md-content')
  _delegateState = { card, textEl, fullText: '', sender, workspaceId, requestId, orchestratorName: orchName, orchestratorAvatar: orchAvatar, orchestratorWsPath: orchWsPath }
})
window.api.onDelegateToken(({ token, thinking, toolStep, roundInfo, sessionId: evtSid }) => {
  if (evtSid && evtSid !== currentSessionId) return
  if (!_delegateState) return
  const flow = _delegateState.textEl.parentNode
  if (toolStep) {
    // Tool step — render in collapsible tool group (same pattern as main streaming)
    const h = humanizeToolStep(toolStep.name, toolStep.input)
    if (h.hidden) return
    if (!_delegateState.toolGroup) {
      _delegateState.toolGroup = document.createElement('div')
      _delegateState.toolGroup.className = 'tool-group-inline'
      _delegateState.toolGroup.innerHTML = `<div class="tool-group-header tool-running"><span class="tool-action-text"><span class="tool-pulse"></span> ${esc(h.icon)} ${esc(h.text)}...</span> <span class="tool-expand">▶</span></div><div class="tool-group-body" style="display:none"></div>`
      const tg = _delegateState.toolGroup
      tg.querySelector('.tool-group-header').onclick = () => {
        const body = tg.querySelector('.tool-group-body')
        const arrow = tg.querySelector('.tool-expand')
        const show = body.style.display === 'none'
        body.style.display = show ? 'block' : 'none'
        arrow.textContent = show ? '▼' : '▶'
      }
      flow.insertBefore(_delegateState.toolGroup, _delegateState.textEl)
    } else {
      const actionText = _delegateState.toolGroup.querySelector('.tool-action-text')
      if (actionText) actionText.innerHTML = `<span class="tool-pulse"></span> ${esc(h.icon)} ${esc(h.text)}...`
    }
    const body = _delegateState.toolGroup.querySelector('.tool-group-body')
    const item = document.createElement('div')
    item.className = 'tool-step-item'
    item.innerHTML = `<span class="tool-step-icon">${h.icon}</span> <span class="tool-step-name">${esc(h.text)}</span>`
    body.appendChild(item)
  } else if (roundInfo) {
    // Round info — update tool group header with purpose
    if (_delegateState.toolGroup) {
      const header = _delegateState.toolGroup.querySelector('.tool-group-header')
      if (header) {
        header.classList.remove('tool-running')
        const expand = _delegateState.toolGroup.querySelector('.tool-expand')?.textContent || '▶'
        const items = _delegateState.toolGroup.querySelectorAll('.tool-step-item')
        const steps = Array.from(items).map(i => ({ name: i.querySelector('.tool-step-name')?.textContent || '' }))
        const summaryText = steps.map(s => s.name).slice(0, 3).join(', ') || '✓ Done'
        const purpose = roundInfo.purpose ? esc(roundInfo.purpose) : ''
        header.innerHTML = purpose
          ? `<span class="tool-action-text"><span class="tool-purpose">${purpose}</span></span> <span class="tool-expand">${expand}</span>`
          : `<span class="tool-action-text">${summaryText}</span> <span class="tool-expand">${expand}</span>`
      }
    }
    // New round — reset tool group so next tools create a new group
    _delegateState.toolGroup = null
  } else if (thinking) {
    // Render thinking in a collapsible details block
    if (!_delegateState.thinkingEl) {
      _delegateState.thinkingText = ''
      const details = document.createElement('details')
      details.className = 'delegate-thinking'
      details.innerHTML = `<summary>▶ ${IC.thought} Thinking...</summary><div class="thinking-content"></div>`
      flow.insertBefore(details, _delegateState.textEl)
      _delegateState.thinkingEl = details.querySelector('.thinking-content')
    }
    _delegateState.thinkingText += token
    _delegateState.thinkingEl.innerHTML = marked.parse(_delegateState.thinkingText)
  } else {
    _delegateState.fullText += token
    _delegateState.textEl.innerHTML = marked.parse(_delegateState.fullText)
  }
  messages.scrollTop = messages.scrollHeight
})
window.api.onDelegateEnd(({ sender, workspaceId, fullText, sessionId: evtSid }) => {
  if (evtSid && evtSid !== currentSessionId) return
  console.log(`[delegate] END: sender=${sender}, textLen=${fullText?.length || 0}`)
  if (!_delegateState) return
  // Remove inline status
  const statusEl = _delegateState.card.querySelector('.inline-status')
  if (statusEl) statusEl.remove()
  // Finalize rendered text
  const finalContent = fullText || _delegateState.fullText
  _delegateState.textEl.innerHTML = linkifyPaths(marked.parse(finalContent))
  // Collapse tool groups
  _delegateState.card.querySelectorAll('.tool-group-inline').forEach(g => {
    const body = g.querySelector('.tool-group-body')
    const arrow = g.querySelector('.tool-expand')
    if (body) body.style.display = 'none'
    if (arrow) arrow.textContent = '▶'
  })
  // Queue delegate message — will be saved together with orchestrator's message to maintain correct order
  _pendingDelegateMessages.push({ role: 'assistant', content: finalContent, sender, senderWorkspaceId: workspaceId })
  // Signal orchestrator handler to create a new card for post-delegate continuation
  const handler = requestHandlers.get(_delegateState.requestId)
  if (handler) {
    handler._pendingSplit = { name: _delegateState.orchestratorName, avatar: _delegateState.orchestratorAvatar, wsPath: _delegateState.orchestratorWsPath }
  }
  _delegateState = null
})

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
      ccOutputEl.innerHTML = `<div class="tool-step-header"><span class="tool-icon">${IC.bot}</span> <strong>Claude Code</strong> <span class="cc-task">${esc(task || '')}</span> <button class="cc-stop-btn" onclick="window.api.ccStop()">Stop</button></div><pre class="cc-pre"></pre>`
      toolArea.appendChild(ccOutputEl)
    }
  } else if (status === 'done') {
    if (ccOutputEl) {
      const header = ccOutputEl.querySelector('.tool-step-header')
      if (header) header.innerHTML = `<span class="tool-icon">${IC.check}</span> <strong>Claude Code</strong> <span class="hint">${length || 0} chars</span>`
    }
    ccOutputEl = null
  } else if (status === 'error') {
    if (ccOutputEl) {
      const header = ccOutputEl.querySelector('.tool-step-header')
      if (header) header.innerHTML = `<span class="tool-icon">${IC.cross}</span> <strong>Claude Code</strong> <span class="hint">${esc(error || 'unknown error')}</span>`
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
// Custom image renderer — resolve relative paths to workspace
marked.use({
  renderer: {
    image({ href, title, text }) {
      if (href && !href.startsWith('http') && !href.startsWith('data:') && !href.startsWith('file:')) {
        // Relative path → resolve to clawDir
        const resolved = _clawDir ? `file://${_clawDir}/${href}` : href
        href = resolved
      }
      const alt = text ? ` alt="${text}"` : ''
      const titleAttr = title ? ` title="${title}"` : ''
      return `<img src="${href}"${alt}${titleAttr}>`
    }
  }
})

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

// ── Session container cache (IM-style) ──
// Each session has its own DOM container inside #messages.
// Switching sessions hides/shows containers — in-flight streaming is preserved.
const sessionContainers = new Map() // sessionId -> { el, history }
let _msgContainer = null  // currently active container (alias for convenience)

function getSessionContainer(sessionId) {
  let entry = sessionContainers.get(sessionId)
  if (!entry) {
    const el = document.createElement('div')
    el.className = 'session-container'
    el.dataset.sid = sessionId
    entry = { el, history: [] }
    sessionContainers.set(sessionId, entry)
  }
  return entry
}

function activateContainer(sessionId) {
  // Hide all existing containers
  for (const [sid, entry] of sessionContainers) {
    entry.el.style.display = sid === sessionId ? '' : 'none'
  }
  const entry = getSessionContainer(sessionId)
  // Ensure it's in the DOM
  if (!entry.el.parentNode) {
    messages.appendChild(entry.el)
  }
  entry.el.style.display = ''
  _msgContainer = entry.el
  history = entry.history
  return entry
}

function destroyContainer(sessionId) {
  const entry = sessionContainers.get(sessionId)
  if (entry) {
    entry.el.remove()
    sessionContainers.delete(sessionId)
  }
}

// ── Theme ──
let _currentTheme = 'light'

function applyTheme(theme) {
  _currentTheme = theme || 'default'
  if (_currentTheme === 'default') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', _currentTheme)
  }
  // Update swatch active state if settings is open
  document.querySelectorAll('.theme-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.themeVal === _currentTheme)
  })
}

function previewTheme(theme) {
  applyTheme(theme)
}

// ── Sidebar resize ──
{
  const handle = document.getElementById('sidebarResize')
  const sidebar = document.getElementById('sidebar')
  if (handle && sidebar) {
    let dragging = false
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault()
      dragging = true
      handle.classList.add('dragging')
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    })
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return
      const w = Math.max(160, Math.min(480, e.clientX))
      sidebar.style.width = w + 'px'
    })
    document.addEventListener('mouseup', () => {
      if (!dragging) return
      dragging = false
      handle.classList.remove('dragging')
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    })
  }
}

// ── Setup screen ──

async function init() {
  // Load feature flags
  try { _featureFlags = await window.api.getFeatureFlags() || _featureFlags } catch {}

  // Check if workspaces exist (F208)
  const workspaces = await window.api.listWorkspaces()
  if (workspaces.length === 0) {
    showSetupScreen()
    return
  }

  const prefs = await window.api.getPrefs()
  if (prefs.clawDir) { _clawDir = prefs.clawDir; enterChat() }
}

function showSetupScreen() {
  document.getElementById('setupScreen').style.display = ''
  document.getElementById('chatScreen').style.display = 'none'
}

async function createNew() {
  const result = await window.api.createWorkspace({})
  if (result?.ok) enterChat()
}

async function openExisting() {
  const result = await window.api.addWorkspace()
  if (result?.ok) enterChat()
}

async function enterChat() {
  document.getElementById('setupScreen').style.display = 'none'
  document.getElementById('chatScreen').style.display = 'flex'
  // Load user profile (name + avatar)
  try {
    const profile = await window.api.getUserProfile()
    _userProfile.userName = profile.userName || ''
    _userProfile.userAvatar = profile.userAvatar || ''
    if (profile.userAvatar) {
      _userProfile.avatarAbsPath = await window.api.getUserAvatarPath()
    }
  } catch {}
  // Load and apply theme (default: light)
  try {
    const config = await window.api.getConfig()
    applyTheme(config?.theme || 'light')
  } catch { applyTheme('light') }
  // Hide legacy UI when feature flag is off
  if (!_featureFlags.legacyAgentFeatures) {
    // Hide Members button (👥)
    const membersBtn = document.querySelector('.header-actions .icon-btn[onclick="toggleMembers()"]')
    if (membersBtn) membersBtn.style.display = 'none'
    // Hide Task bar
    document.getElementById('taskBar').style.display = 'none'
  }
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
  const workspaces = await window.api.listWorkspaces()
  const list = document.getElementById('sessionList')
  list.innerHTML = ''
  // Clear search
  const searchInput = document.getElementById('sessionSearch')
  if (searchInput) searchInput.value = ''

  // Update global workspace cache
  _updateWsCache(workspaces)
  // Build workspace lookup
  const wsMap = new Map()
  for (const ws of workspaces) wsMap.set(ws.id, ws)

  for (const s of sessions) {
    // Restore AI status from DB (activity is transient — always starts idle)
    if (!aiStatus.has(s.id) && s.statusText) {
      aiStatus.set(s.id, s.statusText)
    }
    list.appendChild(renderSessionItem(s, wsMap))
  }
}

function renderSessionItem(s, wsMap) {
  const el = document.createElement('div')
  el.className = 'session-item' + (s.id === currentSessionId ? ' active' : '')
  el.dataset.id = s.id

  const isGroup = s.participants?.length > 1
  const activity = activityState.get(s.id) || 'idle'
  const aiText = aiStatus.get(s.id) || ''

  // Avatar: group=group.png, has workspace=ws avatar img, else bot icon
  let avatarContent = IC.bot
  let avatarIsHtml = true
  if (isGroup) {
    avatarContent = `<img src="avatars/group.png" class="avatar-img">`
  } else if (s.participants?.length === 1 && wsMap) {
    const ws = wsMap.get(s.participants[0])
    if (ws?.identity?.avatar?.includes('.') && ws?.path) {
      avatarContent = `<img src="file://${ws.path}/.paw/${ws.identity.avatar}?t=${_avatarTs}" class="avatar-img">`
    } else if (ws?.identity?.avatar) {
      avatarContent = ws.identity.avatar; avatarIsHtml = false
    }
  }

  // Subtitle: build lastMsg with sender prefix for group chats
  let lastMsg = stripMd(s.lastMessage || '')
  if (isGroup && s.lastSender && lastMsg) {
    let senderName = s.lastSender
    if (s.lastSenderWsId && wsMap) {
      const ws = wsMap.get(s.lastSenderWsId)
      if (ws?.identity?.name) senderName = ws.identity.name
    } else if (wsMap) {
      // Reverse lookup: find ws whose current or former name matches lastSender
      for (const [, ws] of wsMap) {
        if (ws?.identity?.name === senderName || ws?.identity?.wsId === s.lastSender) {
          senderName = ws.identity.name
          break
        }
      }
    }
    lastMsg = `${senderName}: ${lastMsg}`
  }
  el.dataset.lastMsg = lastMsg

  // Time: format updatedAt
  const time = s.updatedAt ? _fmtTime(s.updatedAt) : ''

  // Determine subtitle content
  const isActive = aiText && activity !== 'idle' && activity !== 'done'
  const subText = isActive ? aiText : lastMsg
  const subClass = isActive ? 'session-subtitle active-status' : 'session-subtitle'

  // Dot visibility
  const dotStyle = activity === 'idle' ? 'display:none' : ''

  const avatarHtmlOut = avatarIsHtml ? avatarContent : esc(avatarContent)
  el.innerHTML = `<div class="session-avatar">${avatarHtmlOut}</div><div class="session-body"><div class="session-row-top"><span class="session-title">${esc(s.title)}</span><span class="session-time">${esc(time)}</span></div><div class="session-row-bottom"><span class="${subClass}">${esc(subText)}</span><span class="session-dot ${activity}" style="${dotStyle}"></span></div></div>`

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
  return el
}

function _fmtTime(ts) {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return '昨天'
  return `${d.getMonth() + 1}/${d.getDate()}`
}

async function switchSession(id) {
  const session = await window.api.loadSession(id)
  if (!session) return
  currentSessionId = id

  // Show workspace name in header + coding mode badge + group members
  let titleText = session.title
  let memberNames = ''
  if (session.participants && session.participants.length > 0) {
    try {
      const workspaces = await window.api.listWorkspaces()
      const ws = workspaces.find(w => w.id === session.participants[0])
      if (ws) titleText = `${ws.identity.name} · ${session.title}`
    } catch {}
  }
  // For group chats, collect session agent names
  try {
    const agents = await window.api.listSessionAgents(id)
    if (agents.length > 0) {
      memberNames = agents.map(a => a.name).join(', ')
    }
  } catch {}
  if (session.mode === 'coding') titleText = `⌨ ${titleText}`
  document.getElementById('sessionTitle').textContent = titleText
  const membersEl = document.getElementById('headerMembers')
  if (memberNames) {
    membersEl.textContent = memberNames
    membersEl.style.display = ''
  } else {
    membersEl.textContent = ''
    membersEl.style.display = 'none'
  }

  // Activate container — if already cached (in-flight streaming), reuse it
  const entry = activateContainer(id)

  // If container already has content (e.g. from in-flight streaming), just show it
  if (entry.el.children.length > 0) {
    messages.scrollTop = messages.scrollHeight
    await refreshSessionList()
    if (_featureFlags.legacyAgentFeatures) await refreshTaskBar()
    return
  }

  // Otherwise, build from DB
  let ownerName = 'Assistant'
  let ownerAvatar = null
  let allWorkspaces = []
  if (session.participants && session.participants.length > 0) {
    try {
      allWorkspaces = await window.api.listWorkspaces()
      _updateWsCache(allWorkspaces)
      const ownerWs = allWorkspaces.find(w => w.id === session.participants[0])
      if (ownerWs?.identity?.name) ownerName = ownerWs.identity.name
      if (ownerWs?.identity?.avatar) ownerAvatar = ownerWs.identity.avatar
    } catch {}
  }
  const agents = await window.api.listAgents()
  for (const m of session.messages) {
    // Resolve name from workspace identity (always current), fall back to stored sender
    let sender = m.sender || (m.role === 'user' ? (_userProfile.userName || 'You') : ownerName)
    let msgAvatar = undefined
    let msgWsPath = undefined
    if (m.role === 'assistant') {
      if (m.senderWorkspaceId) {
        const ws = allWorkspaces.find(w => w.id === m.senderWorkspaceId)
        if (ws?.identity?.name) sender = ws.identity.name
        msgAvatar = ws?.identity?.avatar || null
        msgWsPath = ws?.path
      } else {
        msgAvatar = ownerAvatar
        msgWsPath = allWorkspaces.find(w => w.id === session.participants?.[0])?.path
        // Owner message (no senderWorkspaceId) — use current owner name
        if (m.sender && m.sender !== 'You') sender = ownerName
      }
    }
    addCard(m.role, m.content, sender, false, m.toolSteps, msgAvatar, msgWsPath)
    if (m.role === 'user') history.push({ prompt: m.content, answer: '' })
    if (m.role === 'assistant' && history.length) history[history.length - 1].answer = m.content
  }
  messages.scrollTop = messages.scrollHeight
  await refreshSessionList()
  if (_featureFlags.legacyAgentFeatures) await refreshTaskBar()
}

async function newSession() {
  const workspaces = await window.api.listWorkspaces()
  if (workspaces.length > 0) {
    showNewChatSelector(workspaces)
    return
  }
  // No workspaces registered — create ungrouped session
  await createNewSession()
}

async function createNewSession(workspaceId, mode) {
  const opts = workspaceId
    ? { title: mode === 'coding' ? 'Coding' : 'New Chat', participants: [workspaceId], mode: mode || 'chat' }
    : 'New Chat'
  const session = await window.api.createSession(opts)
  currentSessionId = session.id
  activateContainer(session.id)
  const titleDisplay = session.mode === 'coding' ? `⌨ ${session.title}` : session.title
  document.getElementById('sessionTitle').textContent = titleDisplay
  await refreshSessionList()
}

async function showNewChatSelector(workspaces) {
  document.getElementById('newChatOverlay')?.remove()

  // Fetch coding agents registry
  let codingAgentsData = { available: [], registry: [] }
  try { codingAgentsData = await window.api.codingAgentsList() } catch

  const overlay = document.createElement('div')
  overlay.id = 'newChatOverlay'
  overlay.className = 'overlay-backdrop'
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove() }

  const panel = document.createElement('div')
  panel.className = 'new-chat-panel'
  panel.style.maxHeight = '80vh'
  panel.style.overflow = 'hidden'
  panel.style.display = 'flex'
  panel.style.flexDirection = 'column'

  const header = document.createElement('div')
  header.className = 'people-header'
  header.innerHTML = `<span>New Chat</span><button class="icon-btn" onclick="document.getElementById('newChatOverlay')?.remove()">✕</button>`
  panel.appendChild(header)

  const body = document.createElement('div')
  body.style.cssText = 'flex:1;overflow-y:auto;padding:8px'

  // ── Section: Workspace ──
  const wsSection = document.createElement('div')
  wsSection.style.cssText = 'margin-bottom:12px'
  const wsLabel = document.createElement('div')
  wsLabel.className = 'settings-section-title'
  wsLabel.style.cssText = 'padding:4px 8px'
  wsLabel.textContent = 'Workspace'
  wsSection.appendChild(wsLabel)
  for (const ws of workspaces) {
    wsSection.appendChild(_makeAgentItem(ws, () => {
      overlay.remove()
      createNewSession(ws.id, 'chat')
    }))
  }
  body.appendChild(wsSection)

  // ── Section: Coding Agent ──
  if (codingAgentsData.registry.length > 0) {
    const codingSection = document.createElement('div')
    codingSection.style.cssText = 'margin-bottom:12px'
    const codingLabel = document.createElement('div')
    codingLabel.className = 'settings-section-title'
    codingLabel.style.cssText = 'padding:4px 8px'
    codingLabel.textContent = 'Coding Agent'
    codingSection.appendChild(codingLabel)
    for (const agent of codingAgentsData.registry) {
      const item = document.createElement('div')
      item.className = 'new-chat-item'
      const engineIcon = agent.engine === 'claude' ? '🤖' : agent.engine === 'codex' ? '💻' : agent.engine === 'gemini' ? '✨' : '⚡'
      item.innerHTML = `<span class="new-chat-avatar">${engineIcon}</span><div class="new-chat-info"><div class="new-chat-name">${esc(agent.name)}</div><div class="new-chat-desc">${esc(agent.projectPath)}</div></div>`
      item.onclick = () => {
        overlay.remove()
        createNewSession(null, 'coding')
      }
      codingSection.appendChild(item)
    }
    body.appendChild(codingSection)
  }

  // ── Section: Group Chat ──
  if (workspaces.length > 1) {
    const groupSection = document.createElement('div')
    groupSection.style.cssText = 'margin-bottom:12px'
    const groupLabel = document.createElement('div')
    groupLabel.className = 'settings-section-title'
    groupLabel.style.cssText = 'padding:4px 8px'
    groupLabel.textContent = 'Group Chat'
    groupSection.appendChild(groupLabel)
    const selected = new Set()
    for (const ws of workspaces) {
      const item = document.createElement('div')
      item.className = 'new-chat-item'
      const avatar = ws.identity.avatar || ''
      const isEmoji = !avatar.includes('.')
      const avatarHtml = isEmoji ? `<span class="new-chat-avatar">${avatar || IC.bot}</span>` : `<img src="file://${esc(ws.path + '/.paw/' + avatar)}?t=${_avatarTs}" class="new-chat-avatar-img">`
      item.innerHTML = `<input type="checkbox" class="group-ws-check" data-id="${esc(ws.id)}" style="margin-right:8px">${avatarHtml}<div class="new-chat-info"><div class="new-chat-name">${esc(ws.identity.name)}</div></div>`
      item.onclick = (e) => {
        if (e.target.tagName === 'INPUT') return
        const cb = item.querySelector('input')
        cb.checked = !cb.checked
        cb.dispatchEvent(new Event('change'))
      }
      item.querySelector('input').onchange = (e) => {
        if (e.target.checked) selected.add(ws.id)
        else selected.delete(ws.id)
        createBtn.disabled = selected.size < 2
      }
      groupSection.appendChild(item)
    }
    const createBtn = document.createElement('button')
    createBtn.className = 'primary-btn'
    createBtn.style.cssText = 'margin:8px;width:calc(100% - 16px)'
    createBtn.textContent = '创建群聊'
    createBtn.disabled = true
    createBtn.onclick = async () => {
      if (selected.size < 2) return
      const participantIds = [...selected]
      const opts = { title: 'Group Chat', participants: participantIds }
      const session = await window.api.createSession(opts)
      currentSessionId = session.id
      activateContainer(session.id)
      document.getElementById('sessionTitle').textContent = session.title
      overlay.remove()
      await refreshSessionList()
    }
    groupSection.appendChild(createBtn)
    body.appendChild(groupSection)
  }

  // ── Section: Manage Agents ──
  const hr = document.createElement('hr')
  hr.style.cssText = 'border:none;height:1px;background:var(--border-default);margin:8px'
  body.appendChild(hr)
  const manageSection = document.createElement('div')
  manageSection.style.cssText = 'margin-bottom:8px'
  const manageLabel = document.createElement('div')
  manageLabel.className = 'settings-section-title'
  manageLabel.style.cssText = 'padding:4px 8px'
  manageLabel.textContent = 'Manage Agents'
  manageSection.appendChild(manageLabel)

  // List existing agents
  const agentListEl = document.createElement('div')
  agentListEl.className = 'people-list'
  agentListEl.style.cssText = 'padding:0 4px'

  function renderAgentList() {
    agentListEl.innerHTML = ''
    for (const ws of workspaces) {
      const item = document.createElement('div')
      item.className = 'people-item'
      item.style.cssText = 'padding:8px 4px'
      const avatar = ws.identity.avatar || ''
      const isEmoji = !avatar.includes('.')
      const avatarHtml = isEmoji ? `<span class="people-avatar" style="font-size:20px;width:28px">${avatar || IC.bot}</span>` : `<img src="file://${esc(ws.path + '/.paw/' + avatar)}?t=${_avatarTs}" class="people-avatar-img" style="width:28px;height:28px">`
      item.innerHTML = `
        ${avatarHtml}
        <div class="people-info">
          <div class="people-name" style="font-size:13px">${esc(ws.identity.name)}</div>
          <div class="people-desc">${esc(ws.identity.description || '')}</div>
        </div>
        <div class="people-actions">
          <button class="icon-btn" title="编辑" style="font-size:12px">${IC.edit}</button>
          <button class="icon-btn" title="移除" style="font-size:12px">✕</button>
        </div>
      `
      const editBtn = item.querySelectorAll('.icon-btn')[0]
      const removeBtn = item.querySelectorAll('.icon-btn')[1]
      editBtn.onclick = (e) => {
        e.stopPropagation()
        editWorkspaceInline(ws, panel, body, () => {
          // Re-render after edit
          renderAgentList()
          refreshSessionList()
        })
      }
      removeBtn.onclick = async (e) => {
        e.stopPropagation()
        if (!confirm(`确定要移除 "${ws.identity.name}" 吗？`)) return
        await window.api.removeWorkspace(ws.id)
        const idx = workspaces.findIndex(w => w.id === ws.id)
        if (idx !== -1) workspaces.splice(idx, 1)
        renderAgentList()
        refreshSessionList()
      }
      agentListEl.appendChild(item)
    }
  }
  renderAgentList()
  manageSection.appendChild(agentListEl)

  // Add/Create buttons
  const actions = document.createElement('div')
  actions.style.cssText = 'display:flex;gap:8px;padding:8px 4px'
  const addBtn = document.createElement('button')
  addBtn.className = 'secondary-btn'
  addBtn.style.cssText = 'flex:1;margin:0;font-size:12px'
  addBtn.innerHTML = `${IC.folder} 添加已有`
  addBtn.onclick = async () => {
    const result = await window.api.addWorkspace()
    if (result?.ok) {
      overlay.remove()
      const ws = await window.api.listWorkspaces()
      showNewChatSelector(ws)
      await refreshSessionList()
    } else if (result?.error === 'not_a_workspace') {
      alert('该文件夹不是有效的 workspace')
    } else if (result?.error === 'already_registered') {
      alert('该 workspace 已添加')
    }
  }
  const createAgentBtn = document.createElement('button')
  createAgentBtn.className = 'secondary-btn'
  createAgentBtn.style.cssText = 'flex:1;margin:0;font-size:12px'
  createAgentBtn.innerHTML = `${IC.spark} 新建`
  createAgentBtn.onclick = async () => {
    // Inline create form
    actions.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:6px;width:100%">
        <input type="text" id="inlineNewWsName" placeholder="Agent 名称" style="background:var(--bg-base);color:var(--text-primary);border:1px solid var(--border-muted);border-radius:4px;padding:6px 8px;font-size:13px;font-family:inherit">
        <div style="display:flex;gap:6px">
          <button class="primary-btn" id="inlineWsCreate" style="flex:1;font-size:12px">创建</button>
          <button class="secondary-btn" id="inlineWsCancel" style="flex:1;margin:0;font-size:12px">取消</button>
        </div>
      </div>
    `
    const nameInput = actions.querySelector('#inlineNewWsName')
    nameInput.focus()
    actions.querySelector('#inlineWsCancel').onclick = () => {
      overlay.remove()
      window.api.listWorkspaces().then(ws => showNewChatSelector(ws))
    }
    const doCreate = async () => {
      const name = nameInput.value.trim()
      if (!name) return
      const result = await window.api.createWorkspace({ name })
      if (result?.ok) {
        overlay.remove()
        const ws = await window.api.listWorkspaces()
        showNewChatSelector(ws)
        await refreshSessionList()
      } else if (result?.error !== 'cancelled') {
        alert('创建失败: ' + (result?.error || 'unknown'))
      }
    }
    actions.querySelector('#inlineWsCreate').onclick = doCreate
    nameInput.onkeydown = (e) => { if (e.key === 'Enter') doCreate() }
  }
  actions.appendChild(addBtn)
  actions.appendChild(createAgentBtn)
  manageSection.appendChild(actions)

  body.appendChild(manageSection)
  panel.appendChild(body)
  overlay.appendChild(panel)
  document.body.appendChild(overlay)
}

function editWorkspaceInline(ws, panel, scrollContainer, onDone) {
  // Replace panel body with edit form, restore on save/cancel
  const savedBody = scrollContainer.innerHTML
  const currentAvatar = ws.identity?.avatar || ''
  const isImg = currentAvatar.includes('.')
  const previewSrc = isImg && ws.path ? `file://${ws.path}/.paw/${currentAvatar}?t=${Date.now()}` : ''
  scrollContainer.innerHTML = `
    <div style="padding:12px;display:flex;flex-direction:column;gap:8px">
      <div class="settings-section-title">编辑 · ${esc(ws.identity.name)}</div>
      <label style="font-size:12px;color:var(--text-muted)">名称</label>
      <input type="text" id="inlineEditName" value="${esc(ws.identity.name)}" style="background:var(--bg-base);color:var(--text-primary);border:1px solid var(--border-muted);border-radius:6px;padding:8px 10px;font-size:13px;font-family:inherit">
      <label style="font-size:12px;color:var(--text-muted)">头像</label>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
        <div id="avatarPreview" style="width:48px;height:48px;border-radius:50%;background:var(--avatar-bg);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
          ${previewSrc ? `<img src="${esc(previewSrc)}" class="avatar-img">` : `<span style="font-size:28px">${esc(currentAvatar) || '🤖'}</span>`}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${[0,1,2,3,4,5].map(i => `<img src="avatars/${i}.png" class="avatar-preset-thumb${previewSrc ? '' : ''}" data-preset="${i}" style="width:32px;height:32px;border-radius:50%;cursor:pointer;border:2px solid transparent;object-fit:cover;transition:border-color 0.15s">`).join('')}
        </div>
      </div>
      <button class="secondary-btn" id="avatarUploadBtn" style="font-size:12px;margin:0">上传自定义...</button>
      <input type="file" id="avatarFileInput" accept="image/*" style="display:none">
      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="primary-btn" id="inlineEditSave" style="flex:1;font-size:12px">保存</button>
        <button class="secondary-btn" id="inlineEditCancel" style="flex:1;margin:0;font-size:12px">取消</button>
      </div>
    </div>
  `

  // Avatar preset click handlers
  let pendingAvatarAction = null  // { type: 'preset', index } or { type: 'custom', path }
  scrollContainer.querySelectorAll('.avatar-preset-thumb').forEach(thumb => {
    thumb.onmouseenter = () => { thumb.style.borderColor = 'var(--accent)' }
    thumb.onmouseleave = () => { if (!thumb.classList.contains('selected')) thumb.style.borderColor = 'transparent' }
    thumb.onclick = () => {
      scrollContainer.querySelectorAll('.avatar-preset-thumb').forEach(t => { t.style.borderColor = 'transparent'; t.classList.remove('selected') })
      thumb.style.borderColor = 'var(--accent)'
      thumb.classList.add('selected')
      pendingAvatarAction = { type: 'preset', index: parseInt(thumb.dataset.preset) }
      const preview = scrollContainer.querySelector('#avatarPreview')
      preview.innerHTML = `<img src="${thumb.src}" class="avatar-img">`
    }
  })

  // Upload button
  const fileInput = scrollContainer.querySelector('#avatarFileInput')
  scrollContainer.querySelector('#avatarUploadBtn').onclick = () => fileInput.click()
  fileInput.onchange = () => {
    if (fileInput.files[0]) {
      pendingAvatarAction = { type: 'custom', path: fileInput.files[0].path }
      const preview = scrollContainer.querySelector('#avatarPreview')
      preview.innerHTML = `<img src="file://${esc(fileInput.files[0].path)}" class="avatar-img">`
    }
  }

  scrollContainer.querySelector('#inlineEditCancel').onclick = () => {
    scrollContainer.innerHTML = savedBody
    onDone()
  }
  scrollContainer.querySelector('#inlineEditSave').onclick = async () => {
    const newName = scrollContainer.querySelector('#inlineEditName').value

    // Apply avatar change if any
    if (pendingAvatarAction) {
      if (pendingAvatarAction.type === 'preset') {
        await window.api.setWorkspaceAvatar({ id: ws.id, presetIndex: pendingAvatarAction.index })
      } else if (pendingAvatarAction.type === 'custom') {
        await window.api.setWorkspaceAvatar({ id: ws.id, customPath: pendingAvatarAction.path })
      }
    }

    const updated = await window.api.updateWorkspaceIdentity({
      id: ws.id, name: newName, avatar: ws.identity.avatar, description: ws.identity.description || ''
    })
    if (updated) {
      ws.identity = updated.identity || { ...ws.identity, name: newName }
    }
    _avatarTs = Date.now()  // bust avatar cache
    scrollContainer.innerHTML = savedBody
    onDone()
    // Refresh header if current session uses this workspace
    if (currentSessionId) {
      const session = await window.api.loadSession(currentSessionId)
      if (session?.participants?.includes(ws.id)) {
        const allWs = await window.api.listWorkspaces()
        const ownerWs = allWs.find(w => w.id === session.participants[0])
        if (ownerWs) {
          let titleText = `${ownerWs.identity.name} · ${session.title}`
          if (session.mode === 'coding') titleText = `⌨ ${titleText}`
          document.getElementById('sessionTitle').textContent = titleText
        }
      }
    }
  }
  scrollContainer.querySelector('#inlineEditName').focus()
}

function _makeAgentItem(ws, onclick) {
  const item = document.createElement('div')
  item.className = 'new-chat-item'
  const avatar = ws.identity.avatar || ''
  const isEmoji = !avatar.includes('.')
  const avatarHtml = isEmoji ? `<span class="new-chat-avatar">${avatar || IC.bot}</span>` : `<img src="file://${esc(ws.path + '/.paw/' + avatar)}?t=${_avatarTs}" class="new-chat-avatar-img">`
  item.innerHTML = `${avatarHtml}<div class="new-chat-info"><div class="new-chat-name">${esc(ws.identity.name)}</div>${ws.identity.description ? `<div class="new-chat-desc">${esc(ws.identity.description)}</div>` : ''}</div>`
  item.onclick = onclick
  return item
}

async function deleteSession(id) {
  if (!confirm('确定要删除这个对话吗？')) return
  await window.api.deleteSession(id)
  destroyContainer(id)
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
  const sidebar = document.getElementById('sidebar')
  sidebar.classList.toggle('hidden')
  const isHidden = sidebar.classList.contains('hidden')
  document.getElementById('sidebarToggleChat').style.display = isHidden ? '' : 'none'
  document.getElementById('sidebarToggleSidebar').style.display = isHidden ? 'none' : ''
  document.querySelector('.chat-header').classList.toggle('sidebar-hidden', isHidden)
}

async function renameSession(id, el) {
  const titleEl = el.querySelector('.session-title')
  if (!titleEl) return
  const old = titleEl.textContent
  const inp = document.createElement('input')
  inp.type = 'text'
  inp.value = old
  inp.className = 'session-rename-input'
  inp.style.cssText = 'width:100%;background:var(--bg-surface);color:var(--text-primary);border:1px solid var(--border-focus);border-radius:4px;padding:2px 4px;font-size:13px'
  titleEl.replaceWith(inp)
  inp.focus()
  inp.select()
  const finish = async () => {
    const newTitle = inp.value.trim() || old
    await window.api.renameSession(id, newTitle)
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

// F203: @mention autocomplete
let mentionDropdown = null
let mentionMatches = []
let mentionSelectedIndex = 0

input.addEventListener('input', async (e) => {
  const text = input.value
  const cursorPos = input.selectionStart
  const beforeCursor = text.slice(0, cursorPos)
  const atMatch = beforeCursor.match(/@(\w*)$/)

  if (atMatch) {
    const query = atMatch[1].toLowerCase()
    const participants = []

    // Get session agents
    if (currentSessionId) {
      const agents = await window.api.listSessionAgents(currentSessionId)
      agents.forEach(a => participants.push({ name: a.name, type: 'agent' }))
    }

    // Get all workspaces
    const workspaces = await window.api.listWorkspaces()
    workspaces.forEach(ws => participants.push({ name: ws.identity?.name || 'Unnamed', type: 'workspace' }))

    // Filter by query
    mentionMatches = participants.filter(p => p.name.toLowerCase().includes(query))

    if (mentionMatches.length > 0) {
      mentionSelectedIndex = 0
      showMentionDropdown()
    } else {
      hideMentionDropdown()
    }
  } else {
    hideMentionDropdown()
  }
})

input.addEventListener('keydown', e => {
  if (!mentionDropdown || mentionDropdown.style.display === 'none') return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    mentionSelectedIndex = (mentionSelectedIndex + 1) % mentionMatches.length
    updateMentionSelection()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    mentionSelectedIndex = (mentionSelectedIndex - 1 + mentionMatches.length) % mentionMatches.length
    updateMentionSelection()
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    if (mentionMatches.length > 0) {
      e.preventDefault()
      insertMention(mentionMatches[mentionSelectedIndex].name)
    }
  } else if (e.key === 'Escape') {
    hideMentionDropdown()
  }
})

function showMentionDropdown() {
  if (!mentionDropdown) {
    mentionDropdown = document.createElement('div')
    mentionDropdown.className = 'mention-dropdown'
    document.body.appendChild(mentionDropdown)
  }

  mentionDropdown.innerHTML = mentionMatches.map((m, i) =>
    `<div class="mention-item ${i === mentionSelectedIndex ? 'selected' : ''}" data-index="${i}">
      <span class="mention-icon">${m.type === 'agent' ? IC.bot : IC.folder}</span>
      <span class="mention-name">${esc(m.name)}</span>
    </div>`
  ).join('')

  // Position above input
  const inputRect = input.getBoundingClientRect()
  mentionDropdown.style.left = inputRect.left + 'px'
  mentionDropdown.style.bottom = (window.innerHeight - inputRect.top + 8) + 'px'
  mentionDropdown.style.display = 'block'

  // Click handler
  mentionDropdown.querySelectorAll('.mention-item').forEach(item => {
    item.onclick = () => insertMention(mentionMatches[parseInt(item.dataset.index)].name)
  })
}

function hideMentionDropdown() {
  if (mentionDropdown) mentionDropdown.style.display = 'none'
}

function updateMentionSelection() {
  if (!mentionDropdown) return
  mentionDropdown.querySelectorAll('.mention-item').forEach((item, i) => {
    item.className = i === mentionSelectedIndex ? 'mention-item selected' : 'mention-item'
  })
}

function insertMention(name) {
  const text = input.value
  const cursorPos = input.selectionStart
  const beforeCursor = text.slice(0, cursorPos)
  const afterCursor = text.slice(cursorPos)
  const atMatch = beforeCursor.match(/@(\w*)$/)

  if (atMatch) {
    const newText = beforeCursor.slice(0, -atMatch[0].length) + '@' + name + ' ' + afterCursor
    input.value = newText
    const newPos = beforeCursor.length - atMatch[0].length + name.length + 2
    input.setSelectionRange(newPos, newPos)
    input.focus()
  }

  hideMentionDropdown()
  input.dispatchEvent(new Event('input'))
}

// Cmd+K to focus input
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); input.focus() }
})

// Auto-resize textarea
input.addEventListener('input', () => {
  input.style.height = 'auto'
  input.style.height = Math.min(input.scrollHeight, 120) + 'px'
  // Toggle send button active state when input changes
  _updateSendBtn()
})
// Initial state
_updateSendBtn()

function _updateSendBtn() {
  const hasContent = input.value.trim().length > 0
  if (hasContent) {
    sendBtn.classList.add('active')
    sendBtn.disabled = false
  } else {
    sendBtn.classList.remove('active')
    sendBtn.disabled = true
  }
}

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
    const preview = isImg ? `<img src="${f.data}">` : IC.file
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
      if (isOwn && m.content && (typeof m.content !== 'string' || m.content.trim())) {
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

// Avatar rendering helper — image file → <img>, emoji → esc, null → IC fallback
function _renderAvatar(raw, role, wsPath) {
  // User role: show user profile avatar
  if (role === 'user' && _userProfile.avatarAbsPath) {
    return `<img src="file://${esc(_userProfile.avatarAbsPath)}?t=${_avatarTs}" class="avatar-img" onerror="this.style.display='none';this.parentNode.textContent='👤'">`
  }
  if (!raw) return role === 'user' ? IC.user : IC.bot
  if (raw.includes('.') && wsPath) {
    const src = `file://${wsPath}/.paw/${raw}?t=${_avatarTs}`
    return `<img src="${esc(src)}" class="avatar-img" onerror="this.style.display='none';this.parentNode.textContent='🤖'">`
  }
  return esc(raw)
}

function createStreamingCard(agentName, avatar, wsPath) {
  const card = document.createElement('div')
  card.className = 'msg-card assistant'
  const _t = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
  card.innerHTML = `<div class="msg-avatar">${_renderAvatar(avatar, 'assistant', wsPath)}</div><div class="msg-body"><div class="msg-header"><span class="msg-name">${esc(agentName)}</span><span class="msg-time">${_t}</span></div><div class="msg-flow"></div></div>`
  _msgContainer?.appendChild(card) || messages.appendChild(card)
  messages.scrollTop = messages.scrollHeight
  const flowContainer = card.querySelector('.msg-flow')
  const firstTextEl = document.createElement('div')
  firstTextEl.className = 'msg-content md-content'
  flowContainer.appendChild(firstTextEl)
  // Inline status element — sits at bottom of flow, removed when done
  const statusEl = document.createElement('div')
  statusEl.className = 'inline-status'
  statusEl.innerHTML = '<span class="reading-indicator"><span></span><span></span><span></span></span> Thinking...'
  flowContainer.appendChild(statusEl)
  _activeStatusEl = statusEl
  _statusIsAiAuthored = false
  return { card, flowContainer, firstTextEl }
}

function registerStreamHandlers(myRequestId, initialFlowContainer, firstTextEl, sendSessionId) {
  let currentTextEl = firstTextEl
  let segmentText = ''
  let fullText = ''
  let currentToolGroup = null
  let myToolSteps = []
  let flowContainer = initialFlowContainer
  let card = flowContainer.closest('.msg-card')
  let allCards = [card]
  // Thinking state
  let thinkingEl = null
  let thinkingText = ''
  // Keep inline-status at bottom of flow
  const keepStatusAtBottom = () => { if (_activeStatusEl?.parentNode === flowContainer) flowContainer.appendChild(_activeStatusEl) }

  const handler = {
    // Pending split: set by onDelegateEnd to create a new card on next onTextStart
    _pendingSplit: null,

    onTextStart() {
      // After delegate: create a new orchestrator card below the delegate bubble
      if (handler._pendingSplit) {
        const { name, avatar, wsPath: splitWsPath } = handler._pendingSplit
        handler._pendingSplit = null
        // Remove the old card's inline status before creating a new card
        if (_activeStatusEl) { _activeStatusEl.remove(); _activeStatusEl = null }
        const result = createStreamingCard(name, avatar, splitWsPath)
        card = result.card
        flowContainer = result.flowContainer
        currentTextEl = result.firstTextEl
        currentToolGroup = null
        segmentText = ''
        allCards.push(card)
        if (_activeStatusEl) flowContainer.appendChild(_activeStatusEl)
        return
      }
      if (currentToolGroup || myToolSteps.length > 0) {
        currentTextEl = document.createElement('div')
        currentTextEl.className = 'msg-content md-content'
        flowContainer.appendChild(currentTextEl)
        currentToolGroup = null
        segmentText = ''
      }
      keepStatusAtBottom()
    },
    onToken(d) {
      const t = typeof d === 'string' ? d : d.text
      if (!t) return
      // Handle thinking tokens
      if (d.thinking) {
        if (!thinkingEl) {
          const details = document.createElement('details')
          details.className = 'delegate-thinking'
          details.innerHTML = `<summary>▶ ${IC.thought} Thinking...</summary><div class="thinking-content"></div>`
          flowContainer.insertBefore(details, currentTextEl)
          thinkingEl = details.querySelector('.thinking-content')
          thinkingText = ''
          keepStatusAtBottom()
        }
        thinkingText += t
        thinkingEl.innerHTML = marked.parse(thinkingText)
        messages.scrollTop = messages.scrollHeight
        return
      }
      // End of thinking — close thinking block if it was open
      if (thinkingEl) { thinkingEl = null; thinkingText = '' }
      fullText += t
      segmentText += t
      if (currentToolGroup) {
        currentTextEl = document.createElement('div')
        currentTextEl.className = 'msg-content md-content'
        flowContainer.appendChild(currentTextEl)
        currentToolGroup = null
        segmentText = t
        keepStatusAtBottom()
      }
      currentTextEl.innerHTML = marked.parse(segmentText)
      messages.scrollTop = messages.scrollHeight
    },
    onToolStep(d) {
      const isDelegation = d.name === 'delegate_to'
      const displayOutput = isDelegation ? '→ delegating...' : String(d.output).slice(0, 120)
      myToolSteps.push({ name: d.name, input: d.input, output: displayOutput })
      if (sendSessionId) setActivity(sendSessionId, 'running')
      const h = humanizeToolStep(d.name, d.input)
      if (h.hidden) return
      // Update inline status with current action
      if (_activeStatusEl && !_statusIsAiAuthored) {
        updateInlineStatus(`${h.icon} ${h.text}...`)
      }
      if (!currentToolGroup) {
        currentToolGroup = document.createElement('div')
        currentToolGroup.className = 'tool-group-inline'
        currentToolGroup.innerHTML = `<div class="tool-group-header tool-running"><span class="tool-action-text"><span class="tool-pulse"></span> ${esc(h.icon)} ${esc(h.text)}...</span> <span class="tool-expand">▶</span></div><div class="tool-group-body" style="display:none"></div>`
        const thisGroup = currentToolGroup
        thisGroup.querySelector('.tool-group-header').onclick = () => {
          const body = thisGroup.querySelector('.tool-group-body')
          const arrow = thisGroup.querySelector('.tool-expand')
          const show = body.style.display === 'none'
          body.style.display = show ? 'block' : 'none'
          arrow.textContent = show ? '▼' : '▶'
        }
        flowContainer.appendChild(currentToolGroup)
        keepStatusAtBottom()
      } else {
        // Update header to show current action
        const actionText = currentToolGroup.querySelector('.tool-action-text')
        if (actionText) actionText.innerHTML = `<span class="tool-pulse"></span> ${esc(h.icon)} ${esc(h.text)}...`
      }
      const body = currentToolGroup.querySelector('.tool-group-body')
      const item = document.createElement('div')
      item.className = 'tool-step-item'
      item.innerHTML = `<span class="tool-step-icon">${h.icon}</span> <span class="tool-step-name">${esc(h.text)}</span>`
      body.appendChild(item)
      messages.scrollTop = messages.scrollHeight
    },
    onStatus() {},
    onRoundInfo(d) {
      // Round complete — finalize tool group header with purpose (from thinking) + summary
      if (currentToolGroup) {
        const header = currentToolGroup.querySelector('.tool-group-header')
        if (header) {
          header.classList.remove('tool-running')
          const expand = currentToolGroup.querySelector('.tool-expand')?.textContent || '▶'
          const summary = summarizeToolSteps(myToolSteps) || '✓ Done'
          const purpose = d.purpose ? esc(d.purpose) : ''
          header.innerHTML = purpose
            ? `<span class="tool-action-text"><span class="tool-purpose">${purpose}</span></span> <span class="tool-expand">${expand}</span>`
            : `<span class="tool-action-text">${summary}</span> <span class="tool-expand">${expand}</span>`
        }
      }
    }
  }
  requestHandlers.set(myRequestId, handler)

  return { getFullText: () => fullText, getLastSegment: () => segmentText, getToolSteps: () => myToolSteps, getAllCards: () => allCards }
}

function finalizeCard(card, myRequestId, fullText, toolSteps) {
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
    // Set final summary in header
    const header = g.querySelector('.tool-group-header')
    if (header && toolSteps?.length) {
      header.classList.remove('tool-running')
      const summary = summarizeToolSteps(toolSteps) || '✓ Done'
      header.innerHTML = `<span class="tool-action-text">${summary}</span> <span class="tool-expand">▶</span>`
    }
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

    if (cmd === '/export') {
      input.value = ''
      if (!currentSessionId) { addCard('assistant', '没有活跃 session', 'System', true); return }
      const md = await window.api.exportSession(currentSessionId)
      if (!md) { addCard('assistant', '导出失败', 'System', true); return }
      const prompt = await window.api.buildSystemPrompt()
      const full = `# Session Export\n\n## System Prompt\n\n${prompt}\n\n---\n\n## Conversation\n\n${md}`
      // Write to file
      const filename = `session-${currentSessionId}-${new Date().toISOString().slice(0,10)}.md`
      await window.api.writeExport(filename, full)
      addCard('assistant', `已导出到: \`${filename}\``, 'System', true)
      return
    }

    if (cmd === '/model' || cmd === '/models') {
      input.value = ''
      const config = await window.api.getConfig()
      const current = config?.model || '(default)'
      const provider = config?.provider || 'anthropic'
      const models = config?.models || []

      if (!arg) {
        // Show current + list
        let text = `**当前模型:** ${current} (${provider})\n\n`
        if (models.length) {
          text += '**可选模型：**\n'
          models.forEach((m, i) => { text += `${i + 1}. ${m}\n` })
          text += '\n用法: `/model <名称>` 或 `/model <编号>`'
        } else {
          text += '在设置里配置 `models` 列表来启用快速切换'
        }
        addCard('assistant', text, 'System', true)
        return
      }

      // Select by number or name
      let newModel = arg
      const num = parseInt(arg)
      if (!isNaN(num) && num >= 1 && num <= models.length) {
        newModel = models[num - 1]
      }
      config.model = newModel
      await window.api.saveConfig(config)
      addCard('assistant', `模型已切换到: **${newModel}**`, 'System', true)
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
        // Destroy and recreate session container
        destroyContainer(currentSessionId)
        activateContainer(currentSessionId)
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
      addCard('user', text, _userProfile.userName || 'You', true)
      setActivity(currentSessionId, 'thinking')
      // Force compaction by setting the flag
      const chatParams = { prompt: arg || '请压缩历史对话', history, agentId: null, files: [], sessionId: currentSessionId, requestId: null, forceCompact: true }
      // Use normal chat flow — compaction runs in main.js
      // For now, just inform the user
      addCard('assistant', '对话历史已标记压缩，下次发送消息时将自动执行 compaction。', 'System', true)
      setActivity(currentSessionId, 'idle')
      return
    }
  }

  const sendSessionId = currentSessionId

  input.value = ''
  input.style.height = 'auto'
  sendBtn.classList.remove('active')
  sendBtn.disabled = true
  const files = [...pendingFiles]
  pendingFiles = []
  renderAttachPreview()

  // Detect @mention — route to workspace participant or legacy agent
  let targetAgentId = null, targetAgentName = 'Assistant', targetWorkspaceId = null, targetAvatar = null, targetWsPath = null
  const mention = text.match(/^@(\S+)[\s，,]/)
  if (mention && sendSessionId) {
    const q = mention[1].toLowerCase()
    // First try workspace participants
    try {
      const participants = await window.api.getParticipants(sendSessionId)
      if (participants.length > 1) {
        const workspaces = await window.api.listWorkspaces()
        const fuzzyWs = workspaces.find(w => {
          if (!participants.includes(w.id)) return false
          const n = (w.identity?.name || '').toLowerCase()
          return n === q || n.startsWith(q) || q.startsWith(n)
        })
        if (fuzzyWs) {
          targetWorkspaceId = fuzzyWs.id
          targetAgentName = fuzzyWs.identity?.name || 'Assistant'
          targetAvatar = fuzzyWs.identity?.avatar || null
          targetWsPath = fuzzyWs.path
        }
      }
    } catch {}

    // Fallback: legacy agent features
    if (!targetWorkspaceId && _featureFlags.legacyAgentFeatures) {
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
  }

  // Resolve default respondent name (owner = participants[0])
  if (targetAgentName === 'Assistant' && !targetAgentId && !targetWorkspaceId && sendSessionId) {
    try {
      const participants = await window.api.getParticipants(sendSessionId)
      if (participants.length > 0) {
        const workspaces = await window.api.listWorkspaces()
        const ownerWs = workspaces.find(w => w.id === participants[0])
        if (ownerWs?.identity?.name) targetAgentName = ownerWs.identity.name
        if (ownerWs?.identity?.avatar) targetAvatar = ownerWs.identity.avatar
        if (ownerWs?.path) targetWsPath = ownerWs.path
      }
    } catch {}
  }

  // Show user message with attachments
  const attachHtml = files.map(f => f.type.startsWith('image/') ? `<img src="${f.data}" style="max-height:120px;border-radius:6px;margin-top:4px">` : `<div class="attach-chip">${IC.file} ${esc(f.name)}</div>`).join('')
  addCard('user', text + (attachHtml ? `<div>${attachHtml}</div>` : ''), _userProfile.userName || 'You', true)
  setActivity(sendSessionId, 'thinking')

  // ── IM-style: save user message immediately (don't wait for response) ──
  if (sendSessionId) {
    try {
      const s = await window.api.loadSession(sendSessionId)
      if (s) {
        s.messages.push({ role: 'user', content: text, sender: 'You' })
        await window.api.saveSession(s)
        await refreshSessionList()
      }
    } catch (e) { console.warn('[save user msg]', e) }
  }

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
      chatParams = { prompt: text, history, agentId: null, files, sessionId: sendSessionId, requestId: null, targetWorkspaceId: targetWorkspaceId || null }
    }

    const { card, flowContainer, firstTextEl } = createStreamingCard(targetAgentName, targetAvatar, targetWsPath)
    const myRequestId = await window.api.chatPrepare()
    const { getFullText, getLastSegment, getToolSteps, getAllCards } = registerStreamHandlers(myRequestId, flowContainer, firstTextEl, sendSessionId)

    chatParams.requestId = myRequestId

    try {
      const result = await window.api.chat(chatParams)
      if (_activeStatusEl) { _activeStatusEl.remove(); _activeStatusEl = null }
      const finalText = getFullText() || result?.answer || ''
      const lastSegment = getLastSegment()

      // Silence detection — owner called stay_silent, or said NO_REPLY, or empty after delegation
      const hasDelegateMessages = _pendingDelegateMessages.length > 0
      const postDelegateText = lastSegment.trim()
      const toolStepsArr = getToolSteps()
      const calledStaySilent = toolStepsArr.some(t => t.name === 'stay_silent')
      const isNoReply = calledStaySilent
        || finalText.trim() === 'NO_REPLY' || postDelegateText === 'NO_REPLY'
        || (hasDelegateMessages && !postDelegateText)

      let actualSender = targetAgentName
      let actualWorkspaceId = targetWorkspaceId || null
      // Strip NO_REPLY from display text; keep pre-delegate text if any
      let displayText = isNoReply && lastSegment.trim() === 'NO_REPLY'
        ? finalText.replace(/\n?NO_REPLY\s*$/, '').trim()
        : finalText

      if (isNoReply) {
        // If there were delegate messages, keep the first card (has tool calls) but remove post-delegate cards
        const allCards = getAllCards()
        if (hasDelegateMessages && allCards.length > 1) {
          // Remove only the post-delegate split cards (index 1+)
          for (let i = 1; i < allCards.length; i++) allCards[i].remove()
          // Finalize the first card
          for (const c of allCards) {
            if (!c.parentNode) continue
            c.querySelectorAll('.msg-content.md-content').forEach(el => { el.innerHTML = linkifyPaths(el.innerHTML) })
            // Auto-hide thinking in delegate-only cards
            const allDelegate = Array.from(c.querySelectorAll('.tool-step-item')).every(item => item.textContent.includes('delegate_to'))
            if (allDelegate) c.querySelectorAll('.delegate-thinking').forEach(t => t.remove())
            c.querySelectorAll('.tool-group-inline').forEach(g => {
              const body = g.querySelector('.tool-group-body')
              const arrow = g.querySelector('.tool-expand')
              if (body) body.style.display = 'none'
              if (arrow) arrow.textContent = '▶'
            })
          }
        } else if (!hasDelegateMessages) {
          // Pure NO_REPLY with no delegates — remove everything
          allCards.forEach(c => c.remove())
        } else {
          // Has delegates but single card — owner pure dispatch, check for actual text
          for (const c of allCards) {
            const textEls = c.querySelectorAll('.msg-content.md-content')
            const hasText = Array.from(textEls).some(el =>
              el.textContent.trim() && el.textContent.trim() !== 'NO_REPLY'
            )
            if (!hasText) {
              c.remove()  // No content, remove empty bubble
            } else {
              // Has pre-delegate text, keep but collapse tools
              c.querySelectorAll('.tool-group-inline').forEach(g => {
                const body = g.querySelector('.tool-group-body')
                const arrow = g.querySelector('.tool-expand')
                if (body) body.style.display = 'none'
                if (arrow) arrow.textContent = '▶'
              })
            }
          }
        }
        requestHandlers.delete(myRequestId)
      } else {
        // Finalize all orchestrator cards (may have split after delegate)
        const allCards = getAllCards()
        requestHandlers.delete(myRequestId)

        // If post-delegate card has no meaningful text, remove it
        if (hasDelegateMessages && allCards.length > 1 && !displayText.trim()) {
          for (let i = 1; i < allCards.length; i++) allCards[i].remove()
        }

        for (const c of allCards) {
          if (!c.parentNode) continue // already removed
          if (displayText.trim()) {
            c.querySelectorAll('.msg-content.md-content').forEach(el => {
              el.innerHTML = linkifyPaths(el.innerHTML)
            })
          }
          // Auto-hide thinking in cards where the only tool is delegate_to
          const toolGroups = c.querySelectorAll('.tool-group-inline')
          const thinkingBlocks = c.querySelectorAll('.delegate-thinking')
          if (toolGroups.length > 0 && thinkingBlocks.length > 0) {
            // Check if all tool steps in this card are delegate_to
            const allDelegate = Array.from(c.querySelectorAll('.tool-step-item')).every(item =>
              item.textContent.includes('delegate_to')
            )
            if (allDelegate) thinkingBlocks.forEach(t => t.remove())
          }
          c.querySelectorAll('.tool-group-inline').forEach(g => {
            const body = g.querySelector('.tool-group-body')
            const arrow = g.querySelector('.tool-expand')
            if (body) body.style.display = 'none'
            if (arrow) arrow.textContent = '▶'
          })
        }

        // Only show empty placeholder if no delegate messages were sent
        if (!displayText.trim() && !hasDelegateMessages) {
          firstTextEl.innerHTML = '<span style="color:var(--text-faint);font-style:italic">（无文本回复）</span>'
        }
      }

      setActivity(sendSessionId, 'done')

      history.push({ prompt: text, answer: displayText })
      if (sendSessionId) {
        const s = await window.api.loadSession(sendSessionId)
        if (s) {
          const toolSteps = getToolSteps()
          // User message already saved on send (IM-style), only append assistant/delegate messages
          const delegateMsgs = [..._pendingDelegateMessages]
          _pendingDelegateMessages = []
          if (delegateMsgs.length) {
            s.messages.push(...delegateMsgs)
          }
          // Only save orchestrator's final message if it has meaningful content
          if (displayText.trim() && !isNoReply) {
            const assistantMsg = { role: 'assistant', content: displayText, sender: actualSender, senderWorkspaceId: actualWorkspaceId }
            if (toolSteps.length) assistantMsg.toolSteps = toolSteps
            s.messages.push(assistantMsg)
          }
          if (s.messages.length <= 2) {
            s.title = generateTitle(text, displayText || delegateMsgs[0]?.content || '')
          }
          await window.api.saveSession(s)
          // Update header with workspace prefix (same logic as switchSession)
          let titleDisplay = s.title
          if (s.participants?.length > 0) {
            try {
              const workspaces = await window.api.listWorkspaces()
              const ws = workspaces.find(w => w.id === s.participants[0])
              if (ws) titleDisplay = `${ws.identity.name} · ${s.title}`
            } catch {}
          }
          document.getElementById('sessionTitle').textContent = titleDisplay
          await refreshSessionList()
        }
      }
    } catch (err) {
      if (_activeStatusEl) { _activeStatusEl.remove(); _activeStatusEl = null }
      _statusIsAiAuthored = false
      setActivity(sendSessionId, 'idle')
      requestHandlers.delete(myRequestId)
      // Show error inline in the card (preserves tool steps)
      const errEl = document.createElement('div')
      errEl.className = 'msg-content'
      errEl.style.color = 'var(--status-error)'
      errEl.textContent = err.message || String(err)
      flowContainer.appendChild(errEl)
      if (!getFullText().trim()) {
        // Remove empty firstTextEl placeholder
        if (!firstTextEl.textContent.trim() && !firstTextEl.innerHTML.includes('md-content')) firstTextEl.remove()
      }
    }
  }

  _updateSendBtn()
  input.focus()
}

function addCard(role, content, sender, rawHtml, toolSteps, avatarOverride, wsPath) {
  const card = document.createElement('div')
  card.className = `msg-card ${role}`
  const avatarDisplay = _renderAvatar(avatarOverride, role, wsPath)
  const nameClass = role === 'user' ? 'msg-name user-name' : 'msg-name'
  const time = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})

  if (role === 'error') {
    card.innerHTML = `<div class="msg-avatar">${IC.warn}</div><div class="msg-body"><div class="msg-content" style="color:var(--status-error)">${esc(content)}</div></div>`
  } else if (role === 'agent-to-agent') {
    card.innerHTML = `<div class="msg-avatar">${IC.chat}</div><div class="msg-body"><div class="msg-header"><span class="msg-name a2a-name">${esc(sender||'Agent')}</span><span class="msg-time">${time}</span></div><div class="msg-content md-content a2a-content">${marked.parse(content||'')}</div></div>`
  } else if (role === 'user') {
    const body = rawHtml ? content : esc(content)
    card.innerHTML = `<div class="msg-avatar">${avatarDisplay}</div><div class="msg-body"><div class="msg-header"><span class="${nameClass}">${esc(sender||'You')}</span><span class="msg-time">${time}</span></div><div class="msg-content">${body}</div></div>`
  } else {
    card.innerHTML = `<div class="msg-avatar">${avatarDisplay}</div><div class="msg-body"><div class="msg-header"><span class="${nameClass}">${esc(sender||'Assistant')}</span><span class="msg-time">${time}</span></div><div class="msg-flow"></div></div>`
    const flow = card.querySelector('.msg-flow')
    // Render saved tool steps (grouped by consecutive runs)
    if (toolSteps?.length) {
      renderSavedToolSteps(flow, toolSteps)
    }
    // Render text content
    if (content) {
      const textEl = document.createElement('div')
      textEl.className = 'msg-content md-content'
      textEl.innerHTML = marked.parse(content || '')
      flow.appendChild(textEl)
    }
  }

  _msgContainer?.appendChild(card) || messages.appendChild(card)
  messages.scrollTop = messages.scrollHeight
}

function renderSavedToolSteps(container, steps) {
  const group = document.createElement('div')
  group.className = 'tool-group-inline'
  const summary = summarizeToolSteps(steps) || `🔧 ${steps.length} actions`
  group.innerHTML = `<div class="tool-group-header"><span class="tool-action-text">${summary}</span> <span class="tool-expand">▶</span></div><div class="tool-group-body" style="display:none"></div>`
  group.querySelector('.tool-group-header').onclick = () => {
    const body = group.querySelector('.tool-group-body')
    const arrow = group.querySelector('.tool-expand')
    const show = body.style.display === 'none'
    body.style.display = show ? 'block' : 'none'
    arrow.textContent = show ? '▼' : '▶'
  }
  const body = group.querySelector('.tool-group-body')
  for (const s of steps) {
    const h = humanizeToolStep(s.name, s.input)
    if (h.hidden) continue
    const item = document.createElement('div')
    item.className = 'tool-step-item'
    item.innerHTML = `<span class="tool-step-icon">${h.icon}</span> <span class="tool-step-name">${esc(h.text)}</span>`
    body.appendChild(item)
  }
  container.appendChild(group)
}

function renderToolGroup(slot, steps, forceCollapse) {
  if (!steps.length) return
  slot.innerHTML = ''
  const group = document.createElement('div')
  group.className = 'tool-group-live'
  const userToggled = slot.dataset.userToggled === 'true'
  const expanded = forceCollapse ? false : (userToggled ? slot.dataset.expanded === 'true' : true)
  const isRunning = !forceCollapse
  const lastStep = steps[steps.length - 1]
  const lastH = humanizeToolStep(lastStep.name, lastStep.input)
  const headerContent = isRunning
    ? `<span class="tool-action-text"><span class="tool-pulse"></span> ${esc(lastH.icon)} ${esc(lastH.text)}...</span>`
    : `<span class="tool-action-text">${summarizeToolSteps(steps) || '✓ Done'}</span>`
  group.innerHTML = `<div class="tool-group-header${isRunning ? ' tool-running' : ''}">${headerContent} <span class="tool-expand">${expanded ? '▼' : '▶'}</span></div><div class="tool-group-body" style="display:${expanded ? 'block' : 'none'}"></div>`
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
    const h = humanizeToolStep(s.name, s.input)
    if (h.hidden) continue
    const item = document.createElement('div')
    item.className = 'tool-step-item'
    item.innerHTML = `<span class="tool-step-icon">${h.icon}</span> <span class="tool-step-name">${esc(h.text)}</span>`
    body.appendChild(item)
  }
  slot.appendChild(group)
  messages.scrollTop = messages.scrollHeight
}

// addToolCard removed — tool steps now render inline via renderToolGroup

function linkifyPaths(html) {
  // Split HTML into tags and text segments, only linkify text segments
  return html.replace(/(<[^>]*>)|(?:~?\/[\w.@:+-]+(?:\/[\w.@:+-]+)*\.\w+|~?\/[\w.@:+-]+(?:\/[\w.@:+-]+)+)/g, (full, tag) => {
    // If it's an HTML tag, leave it untouched
    if (tag) return tag
    // Skip URL path fragments
    if (full.startsWith('http')) return full
    return `<a href="#" class="file-link" data-path="${full}" title="Click to open">${full}</a>`
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

function stripMd(s) {
  return String(s)
    .replace(/```[\s\S]*?```/g, '[code]')     // code blocks
    .replace(/`([^`]+)`/g, '$1')               // inline code
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '[$1]') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')   // links
    .replace(/^#{1,6}\s+/gm, '')               // headings
    .replace(/(\*\*|__)(.*?)\1/g, '$2')        // bold
    .replace(/(\*|_)(.*?)\1/g, '$2')           // italic
    .replace(/~~(.*?)~~/g, '$1')               // strikethrough
    .replace(/^[\s>*+-]+/gm, '')               // blockquotes + list markers
    .replace(/\n+/g, ' ')                      // newlines → space
    .trim()
}

// ── People Manager (M32/F168) ──

async function openPeopleManager() {
  // Merged into new-chat panel — just open that
  const workspaces = await window.api.listWorkspaces()
  showNewChatSelector(workspaces)
}

// addExistingWorkspace, createNewWorkspace, editWorkspace — merged into showNewChatSelector

async function openSettings() {
  const config = await window.api.getConfig() || {}
  const prefs = await window.api.getPrefs()
  const codingAgent = await window.api.getCodingAgent()
  // Load user profile into settings
  const profile = await window.api.getUserProfile()
  document.getElementById('cfgUserName').value = profile.userName || ''
  const avatarAbsPath = await window.api.getUserAvatarPath()
  const imgEl = document.getElementById('cfgUserAvatarImg')
  const fallbackEl = document.getElementById('cfgUserAvatarFallback')
  if (profile.userAvatar && avatarAbsPath) {
    imgEl.src = `file://${avatarAbsPath}?t=${Date.now()}`
    imgEl.style.display = 'block'
    fallbackEl.style.display = 'none'
  } else {
    imgEl.style.display = 'none'
    fallbackEl.style.display = 'block'
  }
  // Render preset thumbnails
  const presetsContainer = document.getElementById('cfgUserPresets')
  presetsContainer.innerHTML = [0,1,2,3,4,5].map(i =>
    `<img src="avatars/${i}.png" data-preset="${i}" style="width:28px;height:28px;border-radius:50%;cursor:pointer;border:2px solid transparent;object-fit:cover;transition:border-color 0.15s" class="user-avatar-preset">`
  ).join('')
  let _pendingUserAvatar = null
  presetsContainer.querySelectorAll('.user-avatar-preset').forEach(thumb => {
    thumb.onmouseenter = () => { thumb.style.borderColor = 'var(--accent)' }
    thumb.onmouseleave = () => { if (!thumb.classList.contains('selected')) thumb.style.borderColor = 'transparent' }
    thumb.onclick = async () => {
      presetsContainer.querySelectorAll('.user-avatar-preset').forEach(t => { t.style.borderColor = 'transparent'; t.classList.remove('selected') })
      thumb.style.borderColor = 'var(--accent)'
      thumb.classList.add('selected')
      imgEl.src = thumb.src
      imgEl.style.display = 'block'
      fallbackEl.style.display = 'none'
      _pendingUserAvatar = { presetIndex: parseInt(thumb.dataset.preset) }
    }
  })
  // Upload handler
  const fileInput = document.getElementById('cfgUserAvatarFile')
  fileInput.value = ''
  fileInput.onchange = () => {
    if (fileInput.files[0]) {
      imgEl.src = `file://${fileInput.files[0].path}`
      imgEl.style.display = 'block'
      fallbackEl.style.display = 'none'
      presetsContainer.querySelectorAll('.user-avatar-preset').forEach(t => { t.style.borderColor = 'transparent'; t.classList.remove('selected') })
      _pendingUserAvatar = { customPath: fileInput.files[0].path }
    }
  }
  // Store pending avatar action for saveSettings to pick up
  window._pendingUserAvatar = _pendingUserAvatar
  // Watch for changes — auto-save profile on input blur
  const userNameInput = document.getElementById('cfgUserName')
  userNameInput._origOnchange = userNameInput.onchange
  userNameInput.onchange = null
  // Store reference for saveSettings
  window._settingsUserAvatarGetter = () => _pendingUserAvatar

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
  // MCP servers
  const mcpEl = document.getElementById('cfgMcpServers')
  if (mcpEl) {
    mcpEl.value = config.mcpServers ? JSON.stringify(config.mcpServers, null, 2) : ''
  }
  // Load MCP status
  if (window.api.getMcpStatus) {
    try {
      const mcpStatus = await window.api.getMcpStatus()
      renderMcpStatus(mcpStatus)
    } catch {}
  }
  // Update theme swatches
  document.querySelectorAll('.theme-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.themeVal === _currentTheme)
  })
  document.getElementById('settingsOverlay').style.display = 'flex'
}

function renderMcpStatus(status) {
  const el = document.getElementById('mcpStatus')
  if (!el || !status) return
  const entries = Object.entries(status)
  if (entries.length === 0) {
    el.innerHTML = '<p class="hint">No MCP servers configured.</p>'
    return
  }
  el.innerHTML = '<label>Server Status</label>' + entries.map(([name, info]) => {
    const dot = info.status === 'connected' ? IC.dot_green : IC.dot_red
    const detail = info.status === 'connected' ? `${info.toolCount} tools` : (info.error || 'disconnected')
    return `<div style="font-size:13px;color:var(--text-secondary);margin:4px 0">${dot} <strong>${name}</strong> — ${detail}</div>`
  }).join('')
}

async function changeWorkspace() {
  const dir = await window.api.selectClawDir()
  if (dir) {
    closeSettings()
    // Reload the app with the new workspace
    activityState.clear()
    aiStatus.clear()
    currentSessionId = null
    history = []
    await enterChat()
  }
}

async function closeSettings() {
  document.getElementById('settingsOverlay').style.display = 'none'
  await saveSettings()
}

// switchSettingsTab removed — settings is now a single scrollable page

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
  // MCP servers
  const mcpText = document.getElementById('cfgMcpServers')?.value?.trim()
  if (mcpText) {
    try {
      config.mcpServers = JSON.parse(mcpText)
    } catch (e) {
      alert('Invalid MCP JSON: ' + e.message)
      return
    }
  }
  // Theme
  config.theme = _currentTheme === 'default' ? undefined : _currentTheme
  const codingAgent = document.getElementById('cfgCodingAgent').value
  await window.api.saveConfig(config)
  await window.api.setCodingAgent(codingAgent)
  if (config.heartbeat.enabled) await window.api.heartbeatStart()
  else await window.api.heartbeatStop()
  // Save user profile
  const userProfileOpts = { userName: document.getElementById('cfgUserName').value }
  const pendingAvatar = window._settingsUserAvatarGetter?.()
  if (pendingAvatar) Object.assign(userProfileOpts, pendingAvatar)
  const updatedProfile = await window.api.setUserProfile(userProfileOpts)
  _userProfile.userName = updatedProfile.userName || ''
  _userProfile.userAvatar = updatedProfile.userAvatar || ''
  if (updatedProfile.userAvatar) {
    _userProfile.avatarAbsPath = await window.api.getUserAvatarPath()
  }
  _avatarTs = Date.now()
  // Reconnect MCP servers if config changed
  if (window.api.mcpReconnect) {
    try { await window.api.mcpReconnect() } catch {}
  }
}

// ── Members panel ──

async function toggleMembers() {
  document.getElementById('membersOverlay').style.display = 'flex'
  await Promise.all([refreshMemberList(), refreshAgentList()])
}
function closeMembers() { document.getElementById('membersOverlay').style.display = 'none' }

async function refreshMemberList() {
  if (!currentSessionId) return
  const sessionAgents = await window.api.listSessionAgents(currentSessionId)
  const templateAgents = await window.api.listAgents()
  const workspaces = await window.api.listWorkspaces()
  const participants = await window.api.getParticipants(currentSessionId)
  const list = document.getElementById('memberList')
  list.innerHTML = ''

  // Show workspace participants
  if (participants.length > 0) {
    for (let i = 0; i < participants.length; i++) {
      const ws = workspaces.find(w => w.id === participants[i])
      if (!ws) continue
      const el = document.createElement('div')
      el.className = 'member-item'
      const avatar = ws.identity?.avatar || ''
      const isEmoji = !avatar.includes('.')
      const avatarHtml = isEmoji ? (avatar || IC.bot) : `<img src="file://${esc(ws.path + '/.paw/' + avatar)}?t=${_avatarTs}" style="width:16px;height:16px;border-radius:50%;object-fit:cover">`
      const ownerBadge = i === 0 ? ' <span class="hint" style="font-size:10px">(群主)</span>' : ''
      const removeBtn = i > 0 ? `<span class="del-btn" onclick="removeParticipant('${esc(ws.id)}')">✕</span>` : ''
      el.innerHTML = `<span>${avatarHtml} ${esc(ws.identity?.name || ws.id)}${ownerBadge}</span>${removeBtn}`
      list.appendChild(el)
    }

    // Add participant button
    const nonParticipants = workspaces.filter(w => !participants.includes(w.id))
    if (nonParticipants.length > 0) {
      const addEl = document.createElement('div')
      addEl.className = 'member-item'
      addEl.style.cssText = 'margin-top:4px'
      let optionsHtml = '<option value="">添加成员...</option>'
      for (const w of nonParticipants) {
        optionsHtml += `<option value="${esc(w.id)}">${esc(w.identity?.name || w.id)}</option>`
      }
      addEl.innerHTML = `<select id="addParticipantSelect" style="flex:1;background:var(--bg-surface);color:var(--text-primary);border:1px solid var(--border-muted);border-radius:4px;padding:4px;font-size:12px">${optionsHtml}</select><button onclick="addParticipantFromSelect()" style="margin-left:4px" class="icon-btn">+</button>`
      list.appendChild(addEl)
    }

    if (participants.length > 0) {
      const hr = document.createElement('hr')
      hr.style.cssText = 'border-color:var(--border-default);margin:8px 0'
      list.appendChild(hr)
    }
  }

  // Always show user
  const userEl = document.createElement('div')
  userEl.className = 'member-item'
  const userAvatarHtml = _userProfile.avatarAbsPath
    ? `<img src="file://${esc(_userProfile.avatarAbsPath)}?t=${_avatarTs}" style="width:16px;height:16px;border-radius:50%;object-fit:cover;vertical-align:middle">`
    : IC.user
  userEl.innerHTML = `<span>${userAvatarHtml} ${esc(_userProfile.userName || 'You')}</span>`
  list.appendChild(userEl)
  // Show lightweight agents
  for (const a of sessionAgents) {
    const el = document.createElement('div')
    el.className = 'member-item'
    el.innerHTML = `<span>${IC.bot} ${esc(a.name)}</span><span class="hint" style="margin:0 8px;font-size:11px">${esc((a.role || '').slice(0, 40))}</span><span class="del-btn" onclick="removeSessionAgent('${a.id}')">✕</span>`
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

async function addParticipantFromSelect() {
  const select = document.getElementById('addParticipantSelect')
  const wsId = select?.value
  if (!wsId || !currentSessionId) return
  await window.api.addParticipant(currentSessionId, wsId)
  await refreshMemberList()
  await refreshSessionList()
}

async function removeParticipant(wsId) {
  if (!currentSessionId) return
  await window.api.removeParticipant(currentSessionId, wsId)
  await refreshMemberList()
  await refreshSessionList()
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
  const { getFullText, getToolSteps } = registerStreamHandlers(reqId, flowContainer, firstTextEl, sendSessionId)

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
    finalizeCard(card, reqId, finalText, getToolSteps())

    if (sendSessionId) {
      const session = await window.api.loadSession(sendSessionId)
      if (session) {
        const ts = getToolSteps()
        const msg = { role: 'assistant', content: finalText, sender: agentName }
        if (ts.length) msg.toolSteps = ts
        session.messages.push(msg)
        await window.api.saveSession(session)
      }
    }
  } catch (err) {
    console.error(`[Paw] agent ${agentName} response error:`, err)
    requestHandlers.delete(reqId)
  }
}

// ── Agent manager ──

function openAgentManager() { openPeopleManager() }
function closeAgentManager() { closeMembers() }

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
    list.innerHTML = '<p style="color:var(--text-ghost);font-size:13px;text-align:center;padding:16px">No agents yet. Create one below.</p>'
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
  const icon = { pending: IC.clock, 'in-progress': IC.refresh, done: IC.check }
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

// Legacy event handlers (gated by feature flag)
if (_featureFlags.legacyAgentFeatures) {
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
} // end legacyAgentFeatures event handlers

// Init
init()
