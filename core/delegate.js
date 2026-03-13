/**
 * core/delegate.js — Group chat delegate_to handler
 * Extracted from main.js M39 refactor.
 *
 * handleDelegateTo: routes messages to other participants in group chat.
 */
const fs = require('fs')
const eventBus = require('./event-bus')
const workspaceRegistry = require('./workspace-registry')
const { buildSystemPrompt: coreBuildSystemPrompt } = require('./prompt-builder')

async function handleDelegateTo(input, config, sessionId, ctx) {
  const { participant_name, message } = input
  if (!participant_name || !message) return 'Error: participant_name and message are required'
  const delegateDb = ctx.resolveSessionDb(sessionId)
  if (!sessionId || !delegateDb) return 'Error: no active session'

  // Find participant — all participants are workspace IDs now
  const participantIds = ctx.sessionStore.getSessionParticipants(delegateDb, sessionId)
  const allWs = participantIds.map(pid => workspaceRegistry.getWorkspace(pid)).filter(Boolean)

  // Match by name (case-insensitive, partial)
  const q = participant_name.toLowerCase()
  const targetWs = allWs.find(w => {
    const n = (w.identity?.name || '').toLowerCase()
    return n === q || n.startsWith(q) || q.startsWith(n)
  })

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
    // Accumulate delegate message for finishChat (same as non-coding-agent path)
    if (parentRequestId && (responseText || '').trim()) {
      if (!ctx._pendingDelegateMessages.has(parentRequestId)) ctx._pendingDelegateMessages.set(parentRequestId, [])
      ctx._pendingDelegateMessages.get(parentRequestId).push({
        sender: myName, senderWorkspaceId: targetWs.id,
        content: responseText, timestamp: Date.now(),
      })
    }
    console.log(`[delegate_to] ${myName} (coding-agent) responded (${(responseText||'').length} chars), accumulated for finishChat`)
    return responseText
  }

  console.log(`[delegate_to] routing to ${targetWs.identity?.name} (${targetWs.id})`)

  // Build target participant's system prompt
  const targetPrompt = await coreBuildSystemPrompt(targetWs.path)

  // Add group context to their prompt
  const names = allWs.map(w => w.identity?.name || w.id)
  const myName = targetWs.identity?.name || 'Assistant'
  const groupContext = `\n\n---\n\n## Group Chat\nYou are **${myName}** in a group conversation.\nParticipants: ${names.join(', ')}.\nThe user is talking to you. Respond as yourself (${myName}). Be natural and in-character.`
  const fullPrompt = targetPrompt + groupContext

  // Build conversation context — load recent messages from session
  const delegateMessages = []
  try {
    const fullSession = ctx.sessionStore.loadSession(delegateDb, sessionId)
    if (fullSession?.messages?.length) {
      const recent = fullSession.messages.slice(-20)
      for (const m of recent) {
        if (m.role === 'user') {
          delegateMessages.push({ role: 'user', content: m.content })
        } else if (m.role === 'assistant') {
          const senderLabel = m.sender && m.sender !== 'Assistant' ? `[${m.sender}]: ` : ''
          delegateMessages.push({ role: 'assistant', content: senderLabel + (m.content || '') })
        }
      }
    }
  } catch {}

  // Add the delegation message as the final user message
  delegateMessages.push({ role: 'user', content: message })

  // Full agent config
  const llmConfig = (() => { try { return JSON.parse(fs.readFileSync(ctx.configPath(), 'utf8')) } catch { return {} } })()
  const provider = llmConfig.provider || 'anthropic'
  const fullConfig = { ...llmConfig, apiKey: config?.apiKey || llmConfig.apiKey, model: config?.model || llmConfig.model, baseUrl: config?.baseUrl || llmConfig.baseUrl }

  // Delegate gets all tools EXCEPT delegate_to (no recursion)
  const delegateTools = ctx.getToolsWithMcp().filter(t => t.name !== 'delegate_to')

  // Save and restore active request state (delegate runs inside orchestrator's tool loop)
  const savedRequestId = ctx._activeRequestId
  const savedAbortController = ctx._activeAbortController
  const parentRequestId = ctx._activeRequestId

  try {
    // Signal delegate start — frontend creates independent bubble
    const avatar = targetWs.identity?.avatar || '🤖'
    console.log(`[delegate_to] sending delegate-start: sender=${myName}, avatar=${avatar}, wsId=${targetWs.id}`)
    if (parentRequestId) {
      eventBus.dispatch('chat-delegate-start', { requestId: parentRequestId, sender: myName, workspaceId: targetWs.id, avatar, sessionId })
    }

    // Intercept delegate stream events and remap to delegate channels via eventBus
    const delegateRid = parentRequestId + '-delegate'
    const remapHandlers = []
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
          eventBus.dispatch('chat-status', { ...data, sessionId })
        }
        // chat-text-start: no-op for delegate (text appends to same bubble)
      }
      eventBus.on(ch, handler)
      remapHandlers.push({ ch, handler })
    }

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

    const responseText = result?.answer || ''

    // Signal delegate end — frontend finalizes bubble
    if (parentRequestId) {
      eventBus.dispatch('chat-delegate-end', { requestId: parentRequestId, sender: myName, workspaceId: targetWs.id, fullText: responseText, sessionId })
    }

    // Accumulate delegate message — finishChat saves all messages in correct visual order
    if (parentRequestId && responseText.trim()) {
      if (!ctx._pendingDelegateMessages.has(parentRequestId)) ctx._pendingDelegateMessages.set(parentRequestId, [])
      ctx._pendingDelegateMessages.get(parentRequestId).push({
        sender: myName, senderWorkspaceId: targetWs.id,
        content: responseText, timestamp: Date.now(),
        toolSteps: result?.toolSteps || undefined,
      })
    }

    console.log(`[delegate_to] ${myName} responded (${responseText.length} chars), accumulated for finishChat`)
    // Return delegate's response to the orchestrator so they can make informed decisions
    const preview = responseText.length > 300 ? responseText.slice(0, 300) + '…' : responseText
    return `[${myName} responded directly to the user]\nContent: ${preview}\n\nThe response is already visible to the user. Reply NO_REPLY unless you need to delegate further or add genuine value.`
  } catch (err) {
    console.error(`[delegate_to] error:`, err.message)
    // Cleanup delegate event remapping
    for (const { ch, handler } of remapHandlers) eventBus.off(ch, handler)
    // Restore parent state
    ctx._activeRequestId = savedRequestId
    ctx._activeAbortController = savedAbortController
    // Signal delegate end so frontend cleans up the bubble
    if (parentRequestId) {
      eventBus.dispatch('chat-delegate-end', { requestId: parentRequestId, sender: myName, workspaceId: targetWs.id, fullText: `Error: ${err.message}`, sessionId })
    }
    return `Error delegating to ${myName}: ${err.message}`
  }
}

module.exports = { handleDelegateTo }
