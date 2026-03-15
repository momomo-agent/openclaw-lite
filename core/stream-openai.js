/**
 * core/stream-openai.js — OpenAI SSE streaming engine
 * Extracted from main.js M39 refactor.
 *
 * Usage: streamOpenAI(messages, systemPrompt, config, requestId, tools, sessionId, wsIdentity, ctx)
 * ctx = shared context object from main.js with all cross-cutting deps.
 */
const { getApiKey } = require('./api-keys')
const { fetchWithRetry } = require('./api-retry')
const { enforceContextBudget } = require('./context-guard')
const { resolveContextWindow } = require('./model-context')
const { sanitizeTranscript } = require('./transcript-repair')
const { LoopDetector } = require('./loop-detection')
const eventBus = require('./event-bus')

async function streamOpenAI(messages, systemPrompt, config, requestId, tools, sessionId, wsIdentity, ctx) {
  ctx._activeRequestId = requestId
  ctx._activeAbortController = new AbortController()
  // Session-scoped dispatch helper — injects sessionId into every payload
  const ipc = (channel, data) => eventBus.dispatch(channel, { ...data, sessionId })
  // Agent timeout
  const timeoutMs = (config.timeoutSeconds || 600) * 1000
  const timeoutId = setTimeout(() => {
    console.warn(`[Paw] Agent timeout after ${config.timeoutSeconds || 600}s`)
    ctx._activeAbortController?.abort(new Error('Agent timeout'))
    ipc('chat-status', { text: '超时', requestId })
  }, timeoutMs)
  const activeTools = tools || ctx.getToolsWithMcp()
  const base = (config.baseUrl || 'https://api.openai.com').replace(/\/+$/, '')
  const endpoint = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`

  // Convert tools to OpenAI function calling format
  const oaiTools = activeTools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema }
  }))

  const msgs = []
  if (systemPrompt) msgs.push({ role: 'system', content: ctx.scrubMagicStrings(systemPrompt) })

  // Sanitize transcript before adding to msgs (OpenClaw-aligned)
  const sanitizedHistory = sanitizeTranscript([...messages], {
    historyLimit: config?.historyLimit,
    provider: (config?.provider || 'openai'),
    removeTrailingUser: false,
  })
  msgs.push(...sanitizedHistory)

  let fullText = '', roundText = ''
  let flowSteps = []  // Accumulate tool steps in chronological order
  const loopDetector = new LoopDetector()
  // Usage accumulator — tracks across all rounds (OpenClaw-aligned)
  let totalUsageInput = 0, totalUsageOutput = 0

  // OpenClaw-aligned: no hard round limit
  for (let round = 0; ; round++) {
    roundText = ''
    // Send text-start for every round (including round 0) with workspace identity
    ipc('chat-text-start', { requestId, ...(wsIdentity || {}) })
    ctx.pushStatus('thinking', 'Thinking...')

    // Context window guard — enforce budget before API call
    const contextWindowTokens = resolveContextWindow(config)
    enforceContextBudget(msgs, contextWindowTokens)

    const res = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getApiKey(config)}` },
      body: JSON.stringify({ model: config.model || 'gpt-4o', messages: msgs, stream: true, stream_options: { include_usage: true }, tools: oaiTools }),
      signal: ctx._activeAbortController?.signal,
    })
    if (!res.ok) {
      const errText = await res.text()
      const err = new Error(`OpenAI API ${res.status}: ${errText}`)
      err.status = res.status
      err.body = errText
      if (ctx.isContextOverflowError(res.status, errText)) {
        console.warn('[Paw] Context overflow detected (OpenAI), attempting compaction...')
        ipc('chat-status', { text: '上下文溢出，压缩中...', requestId })
        const compactResult = await ctx.compactHistory(msgs, { apiKey: getApiKey(config), baseUrl: config.baseUrl, model: config.model, provider: config.provider || 'openai' })
        if (compactResult.length < msgs.length) {
          msgs.splice(0, msgs.length, ...compactResult)
          round--
          continue
        }
      }
      throw err
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = '', toolCalls = {}
    let roundUsageInput = 0, roundUsageOutput = 0
    const STALL_TIMEOUT_MS = 60000

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
      const lines = buf.split('\n'); buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
        try {
          const parsed = JSON.parse(line.slice(6))
          // Track usage (OpenAI includes it in the final chunk with stream_options)
          if (parsed.usage) {
            roundUsageInput += parsed.usage.prompt_tokens || 0
            roundUsageOutput += parsed.usage.completion_tokens || 0
          }
          const choice = parsed.choices?.[0]
          const delta = choice?.delta
          if (delta?.content) {
            roundText += delta.content
            ipc('chat-token', { requestId, text: delta.content })
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index
              if (!toolCalls[idx]) toolCalls[idx] = { id: '', name: '', args: '' }
              if (tc.id) toolCalls[idx].id = tc.id
              if (tc.function?.name) toolCalls[idx].name = tc.function.name
              if (tc.function?.arguments) toolCalls[idx].args += tc.function.arguments
            }
          }
        } catch {}
      }
    }

    const tcList = Object.values(toolCalls)

    // Accumulate usage across rounds
    totalUsageInput += roundUsageInput
    totalUsageOutput += roundUsageOutput

    if (!tcList.length || !tcList[0].name) {
      // Final round — no tool calls, roundText is the final answer
      fullText += roundText
      ctx.pushStatus('done', 'Done')
      // chat-done dispatched by chat handler after persisting to SQLite
      clearTimeout(timeoutId)
      return { answer: fullText, toolSteps: flowSteps.length ? flowSteps : undefined, usage: { inputTokens: totalUsageInput, outputTokens: totalUsageOutput } }
    }

    // Build assistant message with tool_calls
    const assistantMsg = { role: 'assistant', content: roundText || null, tool_calls: tcList.map(tc => ({
      id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.args }
    }))}
    msgs.push(assistantMsg)

    // Execute tools and add results
    const SILENT_TOOLS_OAI = ['ui_status_set', 'notify', 'delegate_to', 'stay_silent', 'session_title_set']
    for (const tc of tcList) {
      let input = {}
      try { input = JSON.parse(tc.args || '{}') } catch {}
      // Record call first, then detect (OpenClaw-aligned)
      loopDetector.recordToolCall(tc.name, input)
      const loopCheck = loopDetector.check(tc.name, input)
      if (loopCheck.blocked) {
        console.warn(`[Paw] ${loopCheck.reason}`)
        ipc('chat-tool-step', { requestId, name: tc.name, input, output: loopCheck.reason })
        msgs.push({ role: 'tool', tool_call_id: tc.id, content: loopCheck.reason })
        continue
      }
      if (loopCheck.warning) {
        console.warn(`[Paw] ${loopCheck.reason}`)
      }
      const silent = SILENT_TOOLS_OAI.includes(tc.name)
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
      // Always persist to flowSteps (including silent tools) for DB persistence
      flowSteps.push({ name: tc.name, input, output: String(result).slice(0, 500) })
      msgs.push({ role: 'tool', tool_call_id: tc.id, content: ctx.truncateToolResult(result) })
    }
    // Send round info to renderer (purpose from visible text for OpenAI)
    if (tcList.length > 0) {
      const oaiPurpose = roundText ? roundText.trim().split('\n').pop()?.trim().slice(0, 80) || '' : ''
      ipc('chat-round-info', { requestId, round: round + 1, purpose: oaiPurpose })
      // Auto-push round purpose as sidebar status
      if (oaiPurpose) ctx.pushStatus('thinking', oaiPurpose.slice(0, 40))
    }
    ipc('chat-token', { requestId, text: '\n' })
  }
}

module.exports = { streamOpenAI }
