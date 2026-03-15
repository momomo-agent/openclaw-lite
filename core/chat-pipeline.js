/**
 * core/chat-pipeline.js — Chat message preparation pipeline
 *
 * Extracted from main.js _runChat (M36).
 * Pure functions that prepare messages for streaming — no side effects, no global state.
 *
 * Pipeline: buildHistory → buildUserContent → pruneAndCompact → result
 */
const fs = require('fs')
const path = require('path')

/**
 * Build conversation history from various sources.
 * Priority: rawMessages > history > SQLite session
 */
function buildConversationHistory({ rawMessages, history, sessionId, sessionDb, isGroupChat, sessionStore }) {
  const messages = []

  if (rawMessages?.length) {
    messages.push(...rawMessages)
    return messages
  }

  if (history?.length) {
    const participants = sessionId && sessionDb ? sessionStore.getSessionParticipants(sessionDb, sessionId) : []
    const isGroup = participants.length > 1

    if (isGroup && sessionId && sessionDb) {
      const fullSession = sessionStore.loadSession(sessionDb, sessionId)
      if (fullSession?.messages?.length) {
        for (const m of fullSession.messages) {
          if (m.role === 'user') {
            messages.push({ role: 'user', content: m.content })
          } else if (m.role === 'assistant') {
            const senderLabel = m.sender && m.sender !== 'Assistant' ? `[${m.sender}]: ` : ''
            messages.push({ role: 'assistant', content: senderLabel + (m.content || '') })
          }
        }
      }
    } else {
      for (const h of history) {
        messages.push({ role: 'user', content: h.prompt })
        if (h.answer && h.answer.trim()) {
          messages.push({ role: 'assistant', content: h.answer })
        }
      }
    }
    return messages
  }

  // React path: load from SQLite
  if (sessionId && sessionDb) {
    const savedSession = sessionStore.loadSession(sessionDb, sessionId)
    if (savedSession?.messages?.length) {
      for (const m of savedSession.messages) {
        if (m.role === 'user') {
          messages.push({ role: 'user', content: m.content })
        } else if (m.role === 'assistant') {
          const senderLabel = isGroupChat && m.sender && m.sender !== 'Assistant' ? `[${m.sender}]: ` : ''
          messages.push({ role: 'assistant', content: senderLabel + (m.content || '') })
        }
      }
    }
  }

  return messages
}

/**
 * Build user content array from prompt + file attachments.
 * Returns { userContent: Array, contextSuffix: string }
 */
function buildUserContent(prompt, files) {
  const userContent = []
  let fileContext = ''

  if (files?.length) {
    for (const f of files) {
      if (f.type?.startsWith('image/')) {
        let base64 = null
        if (f.path && fs.existsSync(f.path)) {
          base64 = fs.readFileSync(f.path).toString('base64')
        } else if (f.data) {
          base64 = f.data.replace(/^data:[^;]+;base64,/, '')
        }
        if (base64) {
          userContent.push({ type: 'image', source: { type: 'base64', media_type: f.type, data: base64 } })
        }
      } else if (f.path) {
        const stat = fs.existsSync(f.path) ? fs.statSync(f.path) : null
        const isDir = stat?.isDirectory()
        const sizeStr = stat ? `${(stat.size / 1024).toFixed(1)}KB` : ''
        fileContext += `\n📎 ${isDir ? '📁' : ''} ${f.path}${sizeStr ? ` (${sizeStr})` : ''}`
      }
    }
  }

  return { userContent, fileContext }
}

/**
 * Inject group chat context into system prompt.
 * Returns { systemPrompt, isGroupChat, extraTools }
 */
function injectGroupChatContext({ systemPrompt, sessionId, sessionDb, sessionStore, workspaceRegistry, targetWorkspaceId, DELEGATE_TO_TOOL, STAY_SILENT_TOOL }) {
  let isGroupChat = false
  let extraTools = []

  if (!sessionId || !sessionDb) return { systemPrompt, isGroupChat, extraTools }

  try {
    const participants = sessionStore.getSessionParticipants(sessionDb, sessionId)
    const participantInfos = participants.map(pid => {
      const w = workspaceRegistry.getWorkspace(pid)
      const typeHint = w?.type === 'coding-agent' ? ` (coding agent — ${w.engine || 'code'})` : ''
      return { id: pid, name: w?.identity?.name || pid, description: (w?.identity?.description || '') + typeHint }
    })
    const ownerWsId = targetWorkspaceId || participants[0]
    const ownerWs = workspaceRegistry.getWorkspace(ownerWsId)
    const myName = ownerWs?.identity?.name || 'Assistant'

    if (participants.length > 1) {
      isGroupChat = true
      const roster = participantInfos.map(p => `- **${p.name}**${p.description ? ': ' + p.description : ''}`).join('\n')
      systemPrompt += `\n\n---\n\n## Group Chat — You Are the Orchestrator
You are **${myName}**, the owner of this group chat.

### Current Participants (authoritative — ignore historical references to removed members)
${roster}

### Rules
1. **User mentions another participant** → call \`delegate_to\`.
2. **User talks to you or sends a general message** → respond yourself.
3. **After delegate_to** → call \`delegate_to\` again, add genuine context, or call \`stay_silent\`.
4. **Never restate or summarize** what a delegate just said.
5. **Removed members are gone.** Do NOT delegate to or mention them as active.
6. **Untitled session** → call \`session_title_set\` to set a title.`
      extraTools = [DELEGATE_TO_TOOL, STAY_SILENT_TOOL]
    } else if (participants.length === 1) {
      systemPrompt += `\n\n---\n\nYou are **${myName}**. This is a private conversation between you and the user. No other participants are present.`
    }
  } catch {}

  return { systemPrompt, isGroupChat, extraTools }
}

/**
 * Inject teammate context (other agents' recent messages).
 */
function injectTeammateContext(systemPrompt, { agent, sessionId, sessionDb, sessionStore }) {
  if (!agent || !sessionId || !sessionDb) return systemPrompt

  try {
    const session = sessionStore.loadSession(sessionDb, sessionId)
    if (session?.messages?.length) {
      const otherMsgs = session.messages
        .filter(m => m.role === 'assistant' && m.sender && m.sender !== agent.name)
        .slice(-10)
        .map(m => `[Teammate ${m.sender}]: ${(m.content || '').slice(0, 200)}`)
      if (otherMsgs.length) {
        systemPrompt += '\n\n---\n\n## Teammate Context\n' + otherMsgs.join('\n')
      }
    }
  } catch {}

  return systemPrompt
}

/**
 * Build the model failover list with cooldown management.
 */
function buildFailoverList(model, provider, config, failoverManager) {
  const fallbacks = config.fallbackModels || []
  const modelsToTry = [{ model, provider }, ...fallbacks.map(f => {
    const p = f.includes('/') ? f.split('/')[0] : provider
    const m = f.includes('/') ? f.split('/').slice(1).join('/') : f
    return { model: m, provider: p }
  })].filter(t => failoverManager.isAvailable(t.model))

  // If all models are in cooldown, try the primary anyway
  if (modelsToTry.length === 0) {
    modelsToTry.push({ model, provider })
  }

  return modelsToTry
}

module.exports = {
  buildConversationHistory,
  buildUserContent,
  injectGroupChatContext,
  injectTeammateContext,
  buildFailoverList,
}
