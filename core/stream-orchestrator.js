/**
 * core/stream-orchestrator.js — Unified streaming engine
 *
 * Provider-agnostic tool loop with stall detection and usage tracking.
 * Each provider implements an adapter (see provider-anthropic.js, provider-openai.js).
 */
const { LoopDetector } = require('./loop-detection')
const { fetchWithRetry } = require('./api-retry')
const eventBus = require('./event-bus')

const STALL_TIMEOUT_MS = 60_000
const SILENT_TOOLS = new Set(['ui_status_set', 'notify', 'delegate_to', 'stay_silent', 'session_title_set'])

/**
 * Main streaming function.
 *
 * @param {Object} params
 * @param {Array}  params.messages     — conversation history
 * @param {string} params.systemPrompt
 * @param {Object} params.config       — { model, baseUrl, apiKey, timeoutSeconds, ... }
 * @param {string} params.requestId    — unique ID for IPC routing
 * @param {Array}  params.tools        — tool definitions
 * @param {string} params.sessionId
 * @param {Object} params.wsIdentity   — { agentName, avatar }
 * @param {Object} params.ctx          — shared context (executeTool, pushStatus, ...)
 * @param {Object} params.adapter      — provider adapter
 * @param {Object} [params.hooks]      — { getSteeringMessages, getFollowUpMessages }
 */
async function streamChat({ messages, systemPrompt, config, requestId, tools, sessionId, wsIdentity, ctx, adapter, hooks = {} }) {
  ctx._activeRequestId = requestId
  ctx._activeAbortController = new AbortController()

  const ipc = (channel, data) => eventBus.dispatch(channel, { ...data, sessionId })
  const activeTools = tools || ctx.getToolsWithMcp()
  const msgs = adapter.initMessages?.(messages, systemPrompt, config, ctx) ?? [...messages]
  const loopDetector = new LoopDetector()

  let fullText = ''
  let flowSteps = []
  let totalUsage = { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0 }
  let lastUsage = { inputTokens: 0, cacheRead: 0, cacheWrite: 0 }

  // Agent-level timeout
  const timeoutMs = (config.timeoutSeconds || 600) * 1000
  const timeoutId = setTimeout(() => {
    console.warn(`[Paw] Agent timeout after ${timeoutMs / 1000}s`)
    ctx._activeAbortController?.abort(new Error('Agent timeout'))
    ipc('chat-status', { text: '超时', requestId })
  }, timeoutMs)

  try {
    return await _runRounds()
  } finally {
    clearTimeout(timeoutId)
  }

  // ── Round loop ──────────────────────────────────────────────

  async function _runRounds() {
    for (let round = 0; ; round++) {
      const { roundText, roundThinking, toolCalls, roundUsage } = await _streamOneRound(round)

      // Accumulate usage
      for (const k of ['inputTokens', 'outputTokens', 'cacheRead', 'cacheWrite']) {
        totalUsage[k] += roundUsage[k]
      }
      lastUsage = { inputTokens: roundUsage.inputTokens, cacheRead: roundUsage.cacheRead, cacheWrite: roundUsage.cacheWrite }

      if (roundThinking) flowSteps.push({ name: '__thinking__', output: roundThinking })

      // No tool calls → maybe follow-up, otherwise done
      if (!toolCalls.length) {
        if (hooks.getFollowUpMessages) {
          const followUp = hooks.getFollowUpMessages()
          if (followUp?.length) {
            msgs.push(...followUp)
            fullText += '\n'
            ipc('chat-token', { requestId, text: '\n' })
            continue
          }
        }
        ctx.pushStatus('done', 'Done')
        console.log(`[Paw] stream ${adapter.name} done, fullText=${fullText.length}ch`)
        return {
          answer: fullText,
          toolSteps: flowSteps.length ? flowSteps : undefined,
          usage: { ...totalUsage, lastInputTokens: lastUsage.inputTokens, lastCacheRead: lastUsage.cacheRead, lastCacheWrite: lastUsage.cacheWrite },
        }
      }

      // Extract round purpose for sidebar status
      const roundPurpose = _extractPurpose(roundThinking, roundText)
      if (roundPurpose) ctx.pushStatus('thinking', roundPurpose.slice(0, 40))

      // Add assistant message to transcript
      msgs.push(adapter.buildAssistantMsg(roundText, toolCalls))

      // Execute tools (with steering support)
      const steered = await _executeTools(toolCalls, roundPurpose, round)
      if (!steered) {
        fullText += '\n'
        ipc('chat-token', { requestId, text: '\n' })
      }
    }
  }

  // ── Stream one API round ────────────────────────────────────

  async function _streamOneRound(round) {
    let roundText = ''
    let roundThinking = ''
    const toolCalls = []
    let roundUsage = { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0 }
    const parseState = { curTool: null }

    ipc('chat-text-start', { requestId, ...(wsIdentity || {}) })
    ctx.pushStatus('thinking', 'Thinking...')

    const req = adapter.prepareRequest(round, msgs, systemPrompt, activeTools, config, ctx)
    console.log(`[Paw] stream ${adapter.name} round=${round} model=${config.model} msgs=${msgs.length} tools=${activeTools.length}`)

    const res = await fetchWithRetry(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: ctx._activeAbortController?.signal,
    })

    if (!res.ok) {
      const errText = await res.text()
      const handled = await adapter.handleError(res.status, errText, ctx, msgs, ipc, requestId, config)
      if (handled?.retry) return _streamOneRound(round) // retry after compaction
      const err = new Error(`${adapter.name} API ${res.status}: ${errText}`)
      err.status = res.status
      err.body = errText
      throw err
    }

    // Read SSE with stall detection
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
      let stallTimer
      const stallPromise = new Promise((_, reject) => {
        stallTimer = setTimeout(() => reject(new Error('Stream stalled: no data for 60s')), STALL_TIMEOUT_MS)
      })
      let result
      try {
        result = await Promise.race([reader.read(), stallPromise])
      } finally {
        clearTimeout(stallTimer)
      }
      const { done, value } = result
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()

      for (const line of lines) {
        for (const evt of adapter.parseSSE(line, parseState)) {
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
              if (parseState.curTool) { toolCalls.push(parseState.curTool); parseState.curTool = null }
              break
            case 'usage':
              for (const [k, v] of Object.entries(evt.usage)) { if (v) roundUsage[k] += v }
              break
          }
        }
      }
    }

    return { roundText, roundThinking, toolCalls, roundUsage }
  }

  // ── Tool execution ──────────────────────────────────────────

  async function _executeTools(toolCalls, roundPurpose, round) {
    const toolResultMsgs = []
    let steered = false

    for (const tc of toolCalls) {
      // Check for steering interrupts
      if (hooks.getSteeringMessages && !steered) {
        const steering = hooks.getSteeringMessages()
        if (steering?.length) {
          adapter.appendToolResults(msgs, toolResultMsgs)
          msgs.push(...steering)
          steered = true
          break
        }
      }

      let input = {}
      try { input = JSON.parse(tc.json || '{}') } catch {}

      // Loop detection
      loopDetector.recordToolCall(tc.name, input)
      const loopCheck = loopDetector.check(tc.name, input)
      if (loopCheck.blocked) {
        console.warn(`[Paw] ${loopCheck.reason}`)
        _recordToolStep(tc, input, loopCheck.reason)
        toolResultMsgs.push(adapter.buildToolResult(tc.id, loopCheck.reason))
        continue
      }
      if (loopCheck.warning) console.warn(`[Paw] ${loopCheck.reason}`)

      // Execute
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
      if (!silent) _recordToolStep(tc, input, result)
      else flowSteps.push({ name: tc.name, input, output: String(result).slice(0, 500) })

      // Build result (with image support)
      const content = (result?.image && adapter.buildToolResultWithImage)
        ? adapter.buildToolResultWithImage(tc.id, result, ctx)
        : ctx.truncateToolResult(result?.image ? (result.result || result.error || 'Done') : result)
      toolResultMsgs.push(adapter.buildToolResult(tc.id, content))
    }

    if (!steered) adapter.appendToolResults(msgs, toolResultMsgs)
    if (toolCalls.length) ipc('chat-round-info', { requestId, round: round + 1, purpose: roundPurpose })
    return steered
  }

  // ── Helpers ─────────────────────────────────────────────────

  function _recordToolStep(tc, input, output) {
    const out = String(output).slice(0, 500)
    ipc('chat-tool-step', { requestId, name: tc.name, input, output: out })
    flowSteps.push({ name: tc.name, input, output: out })
  }

  function _extractPurpose(thinking, text) {
    if (thinking) {
      const lines = thinking.trim().split('\n').filter(l => l.trim().length > 5)
      const last = lines[lines.length - 1]?.trim().slice(0, 80)
      if (last) return last
    }
    return text?.trim().split('\n').pop()?.trim().slice(0, 80) || ''
  }
}

module.exports = { streamChat }
