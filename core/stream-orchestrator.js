/**
 * core/stream-orchestrator.js — Unified streaming engine
 *
 * Provider-agnostic tool loop, usage tracking, stall detection, status push.
 * Providers (Anthropic/OpenAI) implement adapters with normalized events.
 *
 * Architecture (inspired by pi-agent/OpenClaw):
 *   StreamOrchestrator (this file) — round loop, tool execution, state management
 *     ≈ pi-agent-core's agentLoop()
 *   provider-anthropic.js / provider-openai.js — SSE parsing, message formatting
 *     ≈ pi-ai's provider StreamFunctions
 *   main.js chat handler — retry, session, persistence
 *     ≈ openclaw's pi-embedded-runner
 *
 * Key design from pi-agent:
 *   - convertToLlm: message format conversion separated from business logic
 *   - getSteeringMessages: inject directives mid-tool-execution
 *   - getFollowUpMessages: continue after agent would otherwise stop
 */
const { LoopDetector } = require('./loop-detection')
const eventBus = require('./event-bus')

const STALL_TIMEOUT_MS = 60000  // 60s with no data = stalled
const SILENT_TOOLS = new Set(['ui_status_set', 'notify', 'delegate_to', 'stay_silent', 'session_title_set'])

/**
 * @typedef {Object} StreamEvent
 * @property {'text'|'thinking'|'tool_start'|'tool_delta'|'tool_end'|'usage'} type
 * @property {string} [text]       — for text/thinking events
 * @property {Object} [tool]       — for tool_start: { id, name }
 * @property {string} [json]       — for tool_delta: partial JSON
 * @property {Object} [usage]      — for usage: { inputTokens, outputTokens, cacheRead, cacheWrite }
 */

/**
 * @typedef {Object} ProviderAdapter
 * @property {string}   name             — 'anthropic' | 'openai'
 * @property {function} initMessages     — (messages, systemPrompt, config, ctx) => provider-format messages
 *                                          ≈ pi-agent's convertToLlm: converts app messages to LLM format
 * @property {function} prepareRequest   — (round, msgs, system, tools, config, ctx) => { url, headers, body }
 * @property {function} parseSSE         — (line: string, state: Object) => StreamEvent[]
 * @property {function} buildAssistantMsg — (roundText, toolCalls) => message object for transcript
 * @property {function} buildToolResult  — (toolCallId, content) => message object for transcript
 * @property {function} appendToolResults — (msgs, toolResultMsgs) => void
 * @property {function} handleError      — (status, body, ctx, msgs, ipc, requestId, config) => { retry } | null
 * @property {function} [buildToolResultWithImage] — (toolCallId, result, ctx) => message with image
 */

/**
 * @typedef {Object} StreamOptions
 * @property {function} [getSteeringMessages] — () => AgentMessage[] | null
 *   Called after each tool execution to check for user interruptions/steering.
 *   If messages are returned, remaining tool calls are skipped and these messages
 *   are injected before the next LLM call.
 *   ≈ pi-agent-core's getSteeringMessages()
 *
 * @property {function} [getFollowUpMessages] — () => AgentMessage[] | null
 *   Called when the agent has no more tool calls and would otherwise stop.
 *   If messages are returned, they're added to context and the agent continues.
 *   ≈ pi-agent-core's getFollowUpMessages()
 */

/**
 * Main streaming function — provider-agnostic.
 *
 * @param {Array} messages — conversation history (app format)
 * @param {string} systemPrompt
 * @param {Object} config — provider config (model, baseUrl, apiKey, etc.)
 * @param {string} requestId — unique request identifier for IPC routing
 * @param {Array} tools — tool definitions (Anthropic format)
 * @param {string} sessionId — session identifier for IPC scoping
 * @param {Object} wsIdentity — workspace identity (name, avatar)
 * @param {Object} ctx — shared context with cross-cutting deps
 * @param {ProviderAdapter} adapter — provider-specific implementation
 * @param {StreamOptions} [options] — optional hooks for steering/followup
 */
async function streamChat(messages, systemPrompt, config, requestId, tools, sessionId, wsIdentity, ctx, adapter, options = {}) {
  ctx._activeRequestId = requestId
  ctx._activeAbortController = new AbortController()

  const ipc = (channel, data) => eventBus.dispatch(channel, { ...data, sessionId })

  // Agent timeout
  const timeoutMs = (config.timeoutSeconds || 600) * 1000
  const timeoutId = setTimeout(() => {
    console.warn(`[Paw] Agent timeout after ${config.timeoutSeconds || 600}s`)
    ctx._activeAbortController?.abort(new Error('Agent timeout'))
    ipc('chat-status', { text: '超时', requestId })
  }, timeoutMs)

  const activeTools = tools || ctx.getToolsWithMcp()
  let fullText = ''
  let flowSteps = []
  // Convert app messages to LLM format via adapter (≈ pi-agent's convertToLlm)
  const msgs = adapter.initMessages
    ? adapter.initMessages(messages, systemPrompt, config, ctx)
    : [...messages]
  const loopDetector = new LoopDetector()

  // Usage accumulator (matches OpenClaw's UsageAccumulator pattern)
  let totalUsage = { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0 }
  let lastUsage = { inputTokens: 0, cacheRead: 0, cacheWrite: 0 }

  for (let round = 0; ; round++) {
    let roundText = ''
    let roundThinking = ''
    ipc('chat-text-start', { requestId, ...(wsIdentity || {}) })
    ctx.pushStatus('thinking', 'Thinking...')

    // Build and send request
    const req = adapter.prepareRequest(round, msgs, systemPrompt, activeTools, config, ctx)
    console.log(`[Paw] stream ${adapter.name} round=${round} endpoint=${req.url} model=${config.model} msgCount=${msgs.length} toolCount=${activeTools.length}`)

    const { fetchWithRetry } = require('./api-retry')
    const res = await fetchWithRetry(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: ctx._activeAbortController?.signal,
    })
    console.log(`[Paw] stream ${adapter.name} response status=${res.status}`)

    if (!res.ok) {
      const errText = await res.text()
      const handled = await adapter.handleError(res.status, errText, ctx, msgs, ipc, requestId, config)
      if (handled && handled.retry) {
        round--
        continue
      }
      const err = new Error(`${adapter.name} API ${res.status}: ${errText}`)
      err.status = res.status
      err.body = errText
      throw err
    }

    // Read SSE stream with stall detection
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    const toolCalls = []
    let roundUsage = { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0 }
    const parseState = { curTool: null }

    while (true) {
      let stallTimer
      const stallPromise = new Promise((_, reject) => {
        stallTimer = setTimeout(() => reject(new Error('Stream stalled: no data for 60s')), STALL_TIMEOUT_MS)
      })
      let readResult
      try {
        readResult = await Promise.race([reader.read(), stallPromise])
      } finally {
        clearTimeout(stallTimer)
      }
      const { done, value } = readResult
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()

      for (const line of lines) {
        const events = adapter.parseSSE(line, parseState)
        for (const evt of events) {
          switch (evt.type) {
            case 'text':
              roundText += evt.text
              fullText += evt.text
              ipc('chat-token', { requestId, text: evt.text })
              break
            case 'thinking':
              roundThinking += evt.text
              ipc('chat-token', { requestId, text: evt.text, thinking: true })
              break
            case 'tool_start':
              parseState.curTool = { id: evt.tool.id, name: evt.tool.name, json: '' }
              break
            case 'tool_delta':
              if (parseState.curTool) parseState.curTool.json += evt.json
              break
            case 'tool_end':
              if (parseState.curTool) {
                toolCalls.push(parseState.curTool)
                parseState.curTool = null
              }
              break
            case 'usage':
              if (evt.usage.inputTokens) roundUsage.inputTokens += evt.usage.inputTokens
              if (evt.usage.outputTokens) roundUsage.outputTokens += evt.usage.outputTokens
              if (evt.usage.cacheRead) roundUsage.cacheRead += evt.usage.cacheRead
              if (evt.usage.cacheWrite) roundUsage.cacheWrite += evt.usage.cacheWrite
              break
          }
        }
      }
    }

    // Accumulate usage
    totalUsage.inputTokens += roundUsage.inputTokens
    totalUsage.outputTokens += roundUsage.outputTokens
    totalUsage.cacheRead += roundUsage.cacheRead
    totalUsage.cacheWrite += roundUsage.cacheWrite
    lastUsage = { inputTokens: roundUsage.inputTokens, cacheRead: roundUsage.cacheRead, cacheWrite: roundUsage.cacheWrite }

    // Persist thinking
    if (roundThinking) flowSteps.push({ name: '__thinking__', output: roundThinking })

    // No tool calls → check for follow-up messages before ending
    if (!toolCalls.length) {
      // ≈ pi-agent-core's getFollowUpMessages: continue if there's more to process
      if (options.getFollowUpMessages) {
        const followUp = options.getFollowUpMessages()
        if (followUp && followUp.length > 0) {
          console.log(`[Paw] follow-up messages injected: ${followUp.length}`)
          msgs.push(...followUp)
          fullText += '\n'
          ipc('chat-token', { requestId, text: '\n' })
          continue  // Start a new round with follow-up messages
        }
      }

      ctx.pushStatus('done', 'Done')
      console.log(`[Paw] stream ${adapter.name} done, fullText length: ${fullText.length}`)
      clearTimeout(timeoutId)
      return {
        answer: fullText,
        toolSteps: flowSteps.length ? flowSteps : undefined,
        usage: { ...totalUsage, lastInputTokens: lastUsage.inputTokens, lastCacheRead: lastUsage.cacheRead, lastCacheWrite: lastUsage.cacheWrite },
      }
    }

    // Extract round purpose from thinking or roundText
    let roundPurpose = ''
    if (roundThinking) {
      const purposeLines = roundThinking.trim().split('\n').filter(l => l.trim().length > 5)
      roundPurpose = (purposeLines[purposeLines.length - 1] || '').trim().slice(0, 80)
    }
    if (!roundPurpose && roundText) {
      roundPurpose = roundText.trim().split('\n').pop()?.trim().slice(0, 80) || ''
    }

    // Auto-push round purpose as sidebar status
    if (roundPurpose && toolCalls.length) {
      ctx.pushStatus('thinking', roundPurpose.slice(0, 40))
    }

    // Build assistant message (provider-specific format)
    const assistantMsg = adapter.buildAssistantMsg(roundText, toolCalls)
    msgs.push(assistantMsg)

    // Execute tools — with steering check between each tool
    let steered = false
    const toolResultMsgs = []

    for (const tc of toolCalls) {
      // ≈ pi-agent-core's getSteeringMessages: check for user interruptions
      if (options.getSteeringMessages && !steered) {
        const steering = options.getSteeringMessages()
        if (steering && steering.length > 0) {
          console.log(`[Paw] steering interrupt: skipping remaining ${toolCalls.length - toolResultMsgs.length} tool calls`)
          // Add results for tools already executed
          adapter.appendToolResults(msgs, toolResultMsgs)
          // Inject steering messages
          msgs.push(...steering)
          steered = true
          break  // Skip remaining tool calls, start new LLM round
        }
      }

      let input = {}
      try { input = JSON.parse(tc.json || '{}') } catch {}

      loopDetector.recordToolCall(tc.name, input)
      const loopCheck = loopDetector.check(tc.name, input)
      if (loopCheck.blocked) {
        console.warn(`[Paw] ${loopCheck.reason}`)
        ipc('chat-tool-step', { requestId, name: tc.name, input, output: loopCheck.reason })
        flowSteps.push({ name: tc.name, input, output: loopCheck.reason })
        toolResultMsgs.push(adapter.buildToolResult(tc.id, loopCheck.reason))
        continue
      }
      if (loopCheck.warning) console.warn(`[Paw] ${loopCheck.reason}`)

      const silent = SILENT_TOOLS.has(tc.name)
      if (!silent) ctx.pushStatus('tool', `Running ${tc.name}...`)

      let result, execError
      try {
        result = await ctx.executeTool(tc.name, input, config, { sessionId })
      } catch (err) {
        execError = err
        result = `Error: ${err.message}`
      }

      loopDetector.recordOutcome(tc.name, input, result, execError)

      if (!silent) {
        ipc('chat-tool-step', { requestId, name: tc.name, input, output: String(result).slice(0, 500) })
      }
      flowSteps.push({ name: tc.name, input, output: String(result).slice(0, 500) })

      // Build tool result content (handle image results)
      let toolResultContent
      if (result && typeof result === 'object' && result.image) {
        toolResultContent = adapter.buildToolResultWithImage
          ? adapter.buildToolResultWithImage(tc.id, result, ctx)
          : ctx.truncateToolResult(result.result || result.error || 'Done')
      } else {
        toolResultContent = ctx.truncateToolResult(result)
      }
      toolResultMsgs.push(adapter.buildToolResult(tc.id, toolResultContent))
    }

    // If steered, skip normal tool result append (already done above)
    if (!steered) {
      adapter.appendToolResults(msgs, toolResultMsgs)
    }

    // Send round info to renderer
    if (toolCalls.length > 0) {
      ipc('chat-round-info', { requestId, round: round + 1, purpose: roundPurpose })
    }
    fullText += '\n'
    ipc('chat-token', { requestId, text: '\n' })
  }
}

module.exports = { streamChat }
