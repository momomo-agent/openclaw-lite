/**
 * core/stream-anthropic.js — Anthropic SSE streaming engine
 * Extracted from main.js M39 refactor.
 *
 * Usage: streamAnthropic(messages, systemPrompt, config, requestId, tools, sessionId, wsIdentity, ctx)
 * ctx = shared context object from main.js with all cross-cutting deps.
 */
const { getApiKey } = require('./api-keys')
const { fetchWithRetry } = require('./api-retry')
const { enforceContextBudget } = require('./context-guard')
const { resolveContextWindow } = require('./model-context')
const { sanitizeTranscript } = require('./transcript-repair')
const { LoopDetector } = require('./loop-detection')
const eventBus = require('./event-bus')

async function streamAnthropic(messages, systemPrompt, config, requestId, tools, sessionId, wsIdentity, ctx) {
  ctx._activeRequestId = requestId
  ctx._activeAbortController = new AbortController()
  // Session-scoped dispatch helper — injects sessionId into every payload
  const ipc = (channel, data) => eventBus.dispatch(channel, { ...data, sessionId })
  // Agent timeout — prevent infinite waits (OpenClaw default: 600s)
  const timeoutMs = (config.timeoutSeconds || 600) * 1000
  const timeoutId = setTimeout(() => {
    console.warn(`[Paw] Agent timeout after ${config.timeoutSeconds || 600}s`)
    ctx._activeAbortController?.abort(new Error('Agent timeout'))
    ipc('chat-status', { text: '超时', requestId })
  }, timeoutMs)
  const activeTools = tools || ctx.getToolsWithMcp()
  const base = (config.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')
  const endpoint = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`
  const headers = { 'Content-Type': 'application/json', 'x-api-key': getApiKey(config), 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31' }
  let fullText = '', roundText = '', msgs = [...messages]
  let flowSteps = []  // Accumulate thinking + tool steps in chronological order

  // Transcript sanitization before streaming (OpenClaw-aligned)
  const cfg = config || {}
  msgs = sanitizeTranscript(msgs, {
    historyLimit: cfg.historyLimit,
    provider: 'anthropic',
    removeTrailingUser: false,
  })
  const loopDetector = new LoopDetector()

  // Usage accumulator — tracks across all rounds (OpenClaw-aligned)
  let totalUsageInput = 0, totalUsageOutput = 0
  let totalCacheRead = 0, totalCacheWrite = 0
  let lastUsageInput = 0, lastCacheRead = 0, lastCacheWrite = 0

  // OpenClaw-aligned: no hard round limit. Loop detection + timeout guard against stuck loops.
  for (let round = 0; ; round++) {
    roundText = ''
    // Send text-start for every round (including round 0) with workspace identity
    ipc('chat-text-start', { requestId, ...(wsIdentity || {}) })
    ctx.pushStatus('thinking', 'Thinking...')

    // Build system with cache_control for prompt caching
    const scrubbedSystemPrompt = ctx.scrubMagicStrings(systemPrompt)
    const systemContent = scrubbedSystemPrompt ? [
      { type: 'text', text: scrubbedSystemPrompt, cache_control: { type: 'ephemeral' } }
    ] : undefined

    // Mark last tool with cache_control for tool schema caching
    const cachedTools = activeTools.map((t, i) =>
      i === activeTools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t
    )

    // Mark last user message with cache_control for conversation caching
    // Scrub magic strings from user messages before sending
    const scrubbedMsgs = msgs.map(m => {
      if (m.role === 'user' && typeof m.content === 'string') {
        return { ...m, content: ctx.scrubMagicStrings(m.content) }
      }
      return m
    })
    const cachedMsgs = scrubbedMsgs.map((m, i) => {
      if (i === msgs.length - 1 && m.role === 'user') {
        if (typeof m.content === 'string') {
          return { ...m, content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] }
        }
        if (Array.isArray(m.content)) {
          const last = m.content.length - 1
          const newContent = m.content.map((c, j) =>
            j === last ? { ...c, cache_control: { type: 'ephemeral' } } : c
          )
          return { ...m, content: newContent }
        }
      }
      return m
    })

    // Context window guard — enforce budget before API call
    const contextWindowTokens = resolveContextWindow(config)
    enforceContextBudget(cachedMsgs, contextWindowTokens)

    const body = {
      model: config.model || 'claude-sonnet-4-20250514',
      max_tokens: config.maxTokens || 4096, stream: true,
      system: systemContent,
      messages: cachedMsgs, tools: cachedTools,
    }
    console.log(`[Paw] streamAnthropic round=${round} endpoint=${endpoint} model=${body.model} msgCount=${msgs.length} toolCount=${activeTools.length}`)
    const res = await fetchWithRetry(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: ctx._activeAbortController?.signal })
    console.log(`[Paw] streamAnthropic response status=${res.status}`)
    if (!res.ok) {
      const errText = await res.text()
      const err = new Error(`Anthropic API ${res.status}: ${errText}`)
      err.status = res.status
      err.body = errText
      // Context overflow detection — auto-compact and retry
      if (ctx.isContextOverflowError(res.status, errText)) {
        console.warn('[Paw] Context overflow detected, attempting compaction...')
        ipc('chat-status', { text: '上下文溢出，压缩中...', requestId })
        const compactResult = await ctx.compactHistory(msgs, { apiKey: getApiKey(config), baseUrl: config.baseUrl, model: config.model, provider: 'anthropic' })
        if (compactResult.length < msgs.length) {
          msgs.splice(0, msgs.length, ...compactResult)
          round-- // Retry this round
          continue
        }
      }
      throw err
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = '', toolCalls = [], curBlock = null
    let roundUsageInput = 0, roundUsageOutput = 0
    let roundThinking = '' // Accumulate thinking for this round (tool group purpose)
    const STALL_TIMEOUT_MS = 60000 // 60s with no data = stalled

    while (true) {
      // Race between reader and stall timeout
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
      const lines = buf.split('\n'); buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const evt = JSON.parse(line.slice(6))
          // Track token usage (including cache stats)
          if (evt.type === 'message_start' && evt.message?.usage) {
            roundUsageInput += evt.message.usage.input_tokens || 0
            // Anthropic cache fields
            if (evt.message.usage.cache_read_input_tokens) totalCacheRead += evt.message.usage.cache_read_input_tokens
            if (evt.message.usage.cache_creation_input_tokens) totalCacheWrite += evt.message.usage.cache_creation_input_tokens
            lastCacheRead = evt.message.usage.cache_read_input_tokens || 0
            lastCacheWrite = evt.message.usage.cache_creation_input_tokens || 0
          }
          if (evt.type === 'message_delta' && evt.usage) {
            roundUsageOutput += evt.usage.output_tokens || 0
          }
          if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
            curBlock = { id: evt.content_block.id, name: evt.content_block.name, json: '' }
          } else if (evt.type === 'content_block_delta') {
            if (evt.delta?.type === 'thinking_delta' && evt.delta?.thinking) {
              roundThinking += evt.delta.thinking
              ipc('chat-token', { requestId, text: evt.delta.thinking, thinking: true })
            }
            if (evt.delta?.text && !curBlock) { roundText += evt.delta.text; fullText += evt.delta.text; ipc('chat-token', { requestId, text: evt.delta.text }) }
            if (evt.delta?.partial_json && curBlock) curBlock.json += evt.delta.partial_json
          } else if (evt.type === 'content_block_stop' && curBlock) {
            toolCalls.push(curBlock); curBlock = null
          }
        } catch {}
      }
    }

    // Accumulate usage across rounds
    totalUsageInput += roundUsageInput
    totalUsageOutput += roundUsageOutput
    lastUsageInput = roundUsageInput

    // Persist thinking block into flowSteps
    if (roundThinking) flowSteps.push({ name: '__thinking__', output: roundThinking })

    if (!toolCalls.length) {
      ctx.pushStatus('done', 'Done')
      // chat-done dispatched by chat handler after persisting to SQLite
      console.log('[Paw] streamAnthropic done, fullText length:', fullText.length)
      clearTimeout(timeoutId)
      return { answer: fullText, toolSteps: flowSteps.length ? flowSteps : undefined, usage: { inputTokens: totalUsageInput, outputTokens: totalUsageOutput, cacheRead: totalCacheRead, cacheWrite: totalCacheWrite, lastInputTokens: lastUsageInput, lastCacheRead, lastCacheWrite } }
    }

    // Extract purpose from thinking — last meaningful line before tool calls
    let roundPurpose = ''
    if (roundThinking) {
      const lines = roundThinking.trim().split('\n').filter(l => l.trim().length > 5)
      // Take the last line that looks like a plan/intent (often starts with 让我/I'll/Let me/需要)
      roundPurpose = (lines[lines.length - 1] || '').trim().slice(0, 80)
    }
    // Also check roundText for intent (visible text before tool calls)
    if (!roundPurpose && roundText) {
      roundPurpose = roundText.trim().split('\n').pop()?.trim().slice(0, 80) || ''
    }

    // Execute tools and continue
    const assistantContent = []

    // Auto-push round purpose as sidebar status (replaces manual ui_status_set)
    if (roundPurpose && toolCalls.length) {
      ctx.pushStatus('thinking', roundPurpose.slice(0, 40))
    }
    if (roundText) assistantContent.push({ type: 'text', text: roundText })
    for (const tc of toolCalls) assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: JSON.parse(tc.json || '{}') })
    msgs.push({ role: 'assistant', content: assistantContent })

    const SILENT_TOOLS = ['ui_status_set', 'notify', 'delegate_to', 'stay_silent', 'session_title_set']
    const toolResults = []
    let loopBlocked = false
    for (const tc of toolCalls) {
      const input = JSON.parse(tc.json || '{}')
      // Record call first, then detect (OpenClaw-aligned: record → detect → execute → recordOutcome)
      loopDetector.recordToolCall(tc.name, input)
      const loopCheck = loopDetector.check(tc.name, input)
      if (loopCheck.blocked) {
        console.warn(`[Paw] ${loopCheck.reason}`)
        toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: loopCheck.reason })
        ipc('chat-tool-step', { requestId, name: tc.name, input, output: loopCheck.reason })
        loopBlocked = true
        continue
      }
      if (loopCheck.warning) {
        console.warn(`[Paw] ${loopCheck.reason}`)
      }
      const silent = SILENT_TOOLS.includes(tc.name)
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
      // Always persist to flowSteps (including silent tools like delegate_to) for DB persistence
      flowSteps.push({ name: tc.name, input, output: String(result).slice(0, 500) })
      // Build tool_result content — support image results (e.g. screen_capture)
      let toolResultContent
      if (result && typeof result === 'object' && result.image) {
        // Multi-part: text + image
        toolResultContent = [
          { type: 'text', text: ctx.truncateToolResult(result.result || result.error || 'Done') },
          { type: 'image', source: result.image },
        ]
      } else {
        toolResultContent = ctx.truncateToolResult(result)
      }
      toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: toolResultContent })
    }
    // Send round info to renderer (include purpose extracted from thinking)
    if (toolCalls.length > 0) {
      ipc('chat-round-info', { requestId, round: round + 1, purpose: roundPurpose })
    }
    msgs.push({ role: 'user', content: toolResults })
    fullText += '\n'
    ipc('chat-token', { requestId, text: '\n' })
  }
}

module.exports = { streamAnthropic }
