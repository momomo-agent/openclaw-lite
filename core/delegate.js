/**
 * core/delegate.js — Group chat delegate_to handler
 * Extracted from main.js M39 refactor.
 *
 * handleDelegateTo: routes messages to other participants in group chat.
 * Dependencies injected via ctx for testability:
 *   ctx.getWorkspace(id)     — workspace registry lookup (falls back to require)
 *   ctx.buildSystemPrompt(p) — prompt builder (falls back to require)
 */
const fs = require('fs')
const _eventBus = require('./event-bus')

// Lazy-loaded defaults (overridable via ctx for testing)
let _workspaceRegistry = null
let _buildSystemPrompt = null
function _getWorkspaceRegistry() {
  if (!_workspaceRegistry) _workspaceRegistry = require('./workspace-registry')
  return _workspaceRegistry
}
function _getBuildSystemPrompt() {
  if (!_buildSystemPrompt) _buildSystemPrompt = require('./prompt-builder').buildSystemPrompt
  return _buildSystemPrompt
}

/**
 * Build curated context for a delegate participant.
 *
 * IM group chat model: everyone sees the full conversation, but:
 * - User messages are labeled [User to group] — context, not a directive
 * - Assistant messages show their sender label
 * - The delegation instruction is [ownerName to you] — the only direct instruction
 *
 * This prevents delegates from acting on user instructions meant for the owner
 * (e.g. "搞成表格" is the owner's job, not the delegate's).
 */
function buildDelegateContext(sessionId, delegateDb, ownerName, myName, message, ctx) {
  const messages = []

  try {
    const fullSession = ctx.sessionStore.loadSession(delegateDb, sessionId)
    if (fullSession?.messages?.length) {
      const recent = fullSession.messages.slice(-20)
      for (const m of recent) {
        if (m.role === 'user') {
          // User messages: labeled as group context, NOT a direct instruction
          messages.push({
            role: 'user',
            content: `[User to group]: ${m.content}`
          })
        } else if (m.role === 'assistant') {
          // Other participants' messages: show with sender labels
          const sender = m.sender || ownerName
          messages.push({
            role: 'assistant',
            content: `[${sender}]: ${m.content || ''}`
          })
        }
      }
    }
  } catch {}

  // Include pending delegate messages not yet written to DB —
  // when orchestrator delegates to multiple participants sequentially,
  // earlier delegates' responses are still in memory buffer.
  // Without this, Paul can't see Alice's reply from the same turn.
  const parentRequestId = ctx._activeRequestId
  if (parentRequestId) {
    const pending = ctx._pendingDelegateMessages.get(parentRequestId) || []
    for (const dm of pending) {
      messages.push({
        role: 'assistant',
        content: `[${dm.sender || ownerName}]: ${dm.content || ''}`
      })
    }
  }

  // The actual delegation instruction — clearly from the owner, directed at this delegate
  messages.push({
    role: 'user',
    content: `[${ownerName} to you]: ${message}`
  })

  return messages
}

async function handleDelegateTo(input, config, sessionId, ctx) {
  const { participant_name, message } = input
  if (!participant_name || !message) return 'Error: participant_name and message are required'
  const delegateDb = ctx.resolveSessionDb(sessionId)
  if (!sessionId || !delegateDb) return 'Error: no active session'

  // Resolve dependencies (ctx overrides for testing, require() defaults for production)
  const getWorkspace = ctx.getWorkspace || _getWorkspaceRegistry().getWorkspace
  const buildSystemPrompt = ctx.buildSystemPrompt || _getBuildSystemPrompt()
  const eventBus = ctx.eventBus || _eventBus

  // Find participant — all participants are workspace IDs now
  const participantIds = ctx.sessionStore.getSessionParticipants(delegateDb, sessionId)
  const allWs = participantIds.map(pid => getWorkspace(pid)).filter(Boolean)

  // Match by name (case-insensitive, exact first then partial)
  const q = participant_name.toLowerCase()
  // 1. Exact match
  let targetWs = allWs.find(w => (w.identity?.name || '').toLowerCase() === q)
  // 2. Partial match
  if (!targetWs) {
    targetWs = allWs.find(w => {
      const n = (w.identity?.name || '').toLowerCase()
      return n.startsWith(q) || q.startsWith(n)
    })
  }

  if (!targetWs) return `Error: participant "${participant_name}" not found in group. Available: ${allWs.map(w => w.identity?.name).join(', ')}`

  // Route to coding agent if applicable
  if (targetWs.type === 'coding-agent') {
    const myName = targetWs.identity?.name || targetWs.engine
    console.log(`[delegate_to] routing to coding-agent ${targetWs.engine} at ${targetWs.path}`)
    const parentRequestId = ctx._activeRequestId
    const responseText = await ctx.routeToCodingAgent(targetWs, message, {
      sessionId,
      requestId: parentRequestId,
      senderName: myName,
      senderAvatar: targetWs.identity?.avatar || '🤖'
    })
    // Persist delegate message via ConversationStream or legacy accumulator
    if (parentRequestId && (responseText || '').trim()) {
      const stream = ctx._activeStream
      if (stream) {
        stream.append({
          role: 'assistant', content: responseText, timestamp: Date.now(),
          sender: myName, senderWorkspaceId: targetWs.id,
        })
      } else {
        const dmsg = { sender: myName, senderWorkspaceId: targetWs.id, content: responseText, timestamp: Date.now() }
        if (!ctx._pendingDelegateMessages.has(parentRequestId)) ctx._pendingDelegateMessages.set(parentRequestId, [])
        ctx._pendingDelegateMessages.get(parentRequestId).push(dmsg)
      }
    }
    console.log(`[delegate_to] ${myName} (coding-agent) responded (${(responseText||'').length} chars), accumulated`)
    return responseText
  }

  console.log(`[delegate_to] routing to ${targetWs.identity?.name} (${targetWs.id})`)

  // Build target participant's system prompt
  const targetPrompt = await buildSystemPrompt(targetWs.path)

  // Add group context to their prompt — IM model: everyone sees the full chat,
  // but only the group owner decides who speaks. Delegate just answers when called on.
  const ownerWs = allWs[0]  // participants[0] is always the group owner
  const ownerName = ownerWs?.identity?.name || 'the group owner'
  const myName = targetWs.identity?.name || 'Assistant'
  const otherNames = allWs.filter(w => w.id !== targetWs.id).map(w => w.identity?.name || w.id)
  const groupContext = `\n\n---\n\n## Group Chat Context
You are **${myName}** in a group chat with: ${otherNames.join(', ')}.
**${ownerName}** is the group owner and decides who speaks.

You can see the conversation history above. Messages labeled [User to group] are what the user said to the whole group — treat them as context, not as instructions to you.
The message labeled [${ownerName} to you] is your actual task. Answer ONLY what is asked there.

**Important rules:**
- Only do what ${ownerName} asks YOU to do. Ignore instructions the user gave to ${ownerName} (like "整理成表格") — that is ${ownerName}'s job, not yours.
- Do NOT assign tasks to, wait for, or direct other participants.
- Do NOT offer to compile, summarize, or organize others' work.
- Just answer your part directly and concisely.`
  const fullPrompt = targetPrompt + groupContext

  // Build curated delegate context — use ConversationStream if available (Phase 2),
  // otherwise fall back to buildDelegateContext (Phase 1).
  const stream = ctx._activeStream
  const delegateMessages = stream
    ? stream.readForDelegate(ownerName, myName, message)
    : buildDelegateContext(sessionId, delegateDb, ownerName, myName, message, ctx)

  // Full agent config
  const llmConfig = (() => { try { return JSON.parse(fs.readFileSync(ctx.configPath(), 'utf8')) } catch { return {} } })()
  const provider = llmConfig.provider || 'anthropic'
  const fullConfig = {
    ...llmConfig,
    apiKey: config?.apiKey || llmConfig.apiKey,
    model: config?.model || llmConfig.model,
    baseUrl: config?.baseUrl || llmConfig.baseUrl,
    fetchTimeoutMs: 120_000, // delegates carry heavy context + tools, need more time
  }

  // Delegate gets all tools EXCEPT delegate_to (no recursion)
  const delegateTools = ctx.getToolsWithMcp().filter(t => t.name !== 'delegate_to')

  // Save and restore active request state (delegate runs inside orchestrator's tool loop)
  const savedRequestId = ctx._activeRequestId
  const savedAbortController = ctx._activeAbortController
  const savedStream = ctx._activeStream  // Clear stream so delegate doesn't write to orchestrator's ConversationStream
  const parentRequestId = ctx._activeRequestId

  // Declared outside try so catch can clean up
  const delegateRid = parentRequestId + '-delegate'
  const remapHandlers = []

  try {
    // Signal delegate start — frontend creates independent bubble
    const avatar = targetWs.identity?.avatar || '🤖'
    console.log(`[delegate_to] sending delegate-start: sender=${myName}, avatar=${avatar}, wsId=${targetWs.id}`)
    if (parentRequestId) {
      eventBus.dispatch('chat-delegate-start', { requestId: parentRequestId, sender: myName, workspaceId: targetWs.id, avatar, sessionId })
    }
    // Phase 3: set delegate status on parent stream
    if (savedStream) savedStream.setStatus(myName, 'Thinking...', 'thinking')

    // Intercept delegate stream events and remap to delegate channels via eventBus
    const remapChannels = { 'chat-token': true, 'chat-tool-step': true, 'chat-round-info': true, 'chat-status': true, 'chat-text-start': true }
    for (const ch of Object.keys(remapChannels)) {
      const handler = (data) => {
        if (data?.requestId !== delegateRid) return
        if (ch === 'chat-token') {
          eventBus.dispatch('chat-delegate-token', { requestId: parentRequestId, sender: myName, token: data.text, thinking: data.thinking || false, sessionId })
        } else if (ch === 'chat-tool-step') {
          eventBus.dispatch('chat-delegate-token', { requestId: parentRequestId, sender: myName, toolStep: data, sessionId })
        } else if (ch === 'chat-round-info') {
          eventBus.dispatch('chat-delegate-token', { requestId: parentRequestId, sender: myName, roundInfo: data, sessionId })
        } else if (ch === 'chat-status') {
          // Phase 3: route delegate status through parent stream
          if (savedStream) savedStream.setStatus(myName, data.text || '', 'running')
          else eventBus.dispatch('chat-status', { ...data, sessionId })
        }
        // chat-text-start: no-op for delegate (text appends to same bubble)
      }
      eventBus.on(ch, handler)
      remapHandlers.push({ ch, handler })
    }

    // Clear orchestrator's stream — delegate should NOT write to it.
    // The delegate's text is persisted below via stream.append() with correct sender info.
    ctx._activeStream = null

    let result
    if (provider === 'anthropic') {
      result = await ctx.streamAnthropic(delegateMessages, fullPrompt, fullConfig, delegateRid, delegateTools, sessionId)
    } else {
      result = await ctx.streamOpenAI(delegateMessages, fullPrompt, fullConfig, delegateRid, delegateTools, sessionId)
    }

    // Cleanup delegate event remapping
    for (const { ch, handler } of remapHandlers) eventBus.off(ch, handler)

    // Restore parent state
    ctx._activeRequestId = savedRequestId
    ctx._activeAbortController = savedAbortController
    ctx._activeStream = savedStream

    const responseText = result?.answer || ''

    // Signal delegate end — frontend finalizes bubble
    if (parentRequestId) {
      eventBus.dispatch('chat-delegate-end', { requestId: parentRequestId, sender: myName, workspaceId: targetWs.id, fullText: responseText, sessionId })
    }
    // Phase 3: clear delegate status, restore orchestrator on parent stream
    if (savedStream) savedStream.setStatus(null, '', 'idle')

    // Persist delegate message via ConversationStream or legacy accumulator
    if (parentRequestId && responseText.trim()) {
      if (stream) {
        // ConversationStream path: write to DB immediately in correct position
        stream.append({
          role: 'assistant', content: responseText, timestamp: Date.now(),
          sender: myName, senderWorkspaceId: targetWs.id,
          toolSteps: result?.toolSteps || undefined,
        })
      } else {
        // Legacy path: accumulate for finishChat
        const dmsg = {
          sender: myName, senderWorkspaceId: targetWs.id,
          content: responseText, timestamp: Date.now(),
          toolSteps: result?.toolSteps || undefined,
        }
        if (!ctx._pendingDelegateMessages.has(parentRequestId)) ctx._pendingDelegateMessages.set(parentRequestId, [])
        ctx._pendingDelegateMessages.get(parentRequestId).push(dmsg)
      }
    }

    console.log(`[delegate_to] ${myName} responded (${responseText.length} chars), accumulated`)
    // Return delegate's FULL response to the orchestrator — they need complete content
    // to make informed decisions (delegate again, add context, or stay silent).
    // Token budget is managed by truncateToolResult() in stream-orchestrator.
    return `[${myName} responded directly to the user]\n\n${responseText}\n\n---\nThe response above is already visible to the user. Do NOT restate or summarize it. Either delegate to another participant, add genuinely new context, or call stay_silent.`
  } catch (err) {
    console.error(`[delegate_to] error:`, err.message)
    // Cleanup delegate event remapping
    for (const { ch, handler } of remapHandlers) eventBus.off(ch, handler)
    // Restore parent state
    ctx._activeRequestId = savedRequestId
    ctx._activeAbortController = savedAbortController
    ctx._activeStream = savedStream
    // Phase 3: clear delegate status on error
    if (savedStream) savedStream.setStatus(null, '', 'idle')
    if (parentRequestId) {
      eventBus.dispatch('chat-delegate-end', { requestId: parentRequestId, sender: myName, workspaceId: targetWs.id, fullText: `Error: ${err.message}`, sessionId })
    }
    return `Error delegating to ${myName}: ${err.message}`
  }
}

module.exports = { handleDelegateTo, buildDelegateContext }
