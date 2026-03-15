/**
 * core/provider-openai.js — OpenAI SSE adapter for StreamOrchestrator
 *
 * Handles: request construction, SSE parsing, message formatting, error handling.
 * All tool loop logic lives in stream-orchestrator.js.
 */
const { getApiKey } = require('./api-keys')
const { enforceContextBudget } = require('./context-guard')
const { resolveContextWindow } = require('./model-context')
const { sanitizeTranscript } = require('./transcript-repair')

const openaiAdapter = {
  name: 'openai',

  /**
   * Initialize messages — prepend system message + sanitize.
   */
  initMessages(messages, systemPrompt, config, ctx) {
    const msgs = []
    if (systemPrompt) msgs.push({ role: 'system', content: ctx.scrubMagicStrings(systemPrompt) })
    const sanitized = sanitizeTranscript([...messages], {
      historyLimit: config?.historyLimit,
      provider: config?.provider || 'openai',
      removeTrailingUser: false,
    })
    msgs.push(...sanitized)
    return msgs
  },

  /**
   * Build the HTTP request for a round.
   */
  prepareRequest(round, msgs, systemPrompt, tools, config, ctx) {
    const base = (config.baseUrl || 'https://api.openai.com').replace(/\/+$/, '')
    const endpoint = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`

    // Convert tools to OpenAI function calling format
    const oaiTools = tools.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }))

    // Context budget
    const contextWindowTokens = resolveContextWindow(config)
    enforceContextBudget(msgs, contextWindowTokens)

    return {
      url: endpoint,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getApiKey(config)}`,
      },
      body: {
        model: config.model || 'gpt-4o',
        messages: msgs,
        stream: true,
        stream_options: { include_usage: true },
        tools: oaiTools,
      },
    }
  },

  /**
   * Parse a single SSE line into normalized events.
   * OpenAI streams tool calls incrementally via index — we accumulate in parseState._oaiToolCalls
   * and emit tool_start/tool_delta/tool_end events that the orchestrator understands.
   */
  parseSSE(line, parseState) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') return []
    const events = []
    try {
      const parsed = JSON.parse(line.slice(6))

      // Usage (included in final chunk with stream_options)
      if (parsed.usage) {
        events.push({
          type: 'usage',
          usage: {
            inputTokens: parsed.usage.prompt_tokens || 0,
            outputTokens: parsed.usage.completion_tokens || 0,
          },
        })
      }

      const choice = parsed.choices?.[0]
      const delta = choice?.delta

      // Text content
      if (delta?.content) {
        events.push({ type: 'text', text: delta.content })
      }

      // Tool calls — accumulate in parseState
      if (delta?.tool_calls) {
        if (!parseState._oaiToolCalls) parseState._oaiToolCalls = {}
        for (const tc of delta.tool_calls) {
          const idx = tc.index
          if (!parseState._oaiToolCalls[idx]) {
            parseState._oaiToolCalls[idx] = { id: '', name: '', args: '' }
          }
          if (tc.id) parseState._oaiToolCalls[idx].id = tc.id
          if (tc.function?.name) parseState._oaiToolCalls[idx].name = tc.function.name
          if (tc.function?.arguments) parseState._oaiToolCalls[idx].args += tc.function.arguments
        }
      }

      // Finish reason — emit tool_start+tool_end for each accumulated tool call
      if (choice?.finish_reason === 'tool_calls') {
        if (parseState._oaiToolCalls) {
          for (const tc of Object.values(parseState._oaiToolCalls)) {
            if (tc.id && tc.name) {
              // Emit start + end pair so orchestrator picks up the complete tool call
              events.push({ type: 'tool_start', tool: { id: tc.id, name: tc.name } })
              events.push({ type: 'tool_delta', json: tc.args })
              events.push({ type: 'tool_end' })
            }
          }
          parseState._oaiToolCalls = {}
        }
      }
    } catch {}
    return events
  },

  /**
   * Build OpenAI-format assistant message with tool calls.
   */
  buildAssistantMsg(roundText, toolCalls) {
    return {
      role: 'assistant',
      content: roundText || null,
      tool_calls: toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.json || '{}' },
      })),
    }
  },

  /**
   * Build a single tool result (OpenAI uses role: 'tool').
   */
  buildToolResult(toolCallId, content) {
    return { role: 'tool', tool_call_id: toolCallId, content: typeof content === 'string' ? content : JSON.stringify(content) }
  },

  /**
   * Append tool results — OpenAI adds each as a separate message.
   */
  appendToolResults(msgs, toolResultMsgs) {
    msgs.push(...toolResultMsgs)
  },

  /**
   * Handle API errors.
   */
  async handleError(status, body, ctx, msgs, ipc, requestId, config) {
    if (ctx.isContextOverflowError(status, body)) {
      console.warn('[Paw] Context overflow detected (OpenAI), attempting compaction...')
      ipc('chat-status', { text: '上下文溢出，压缩中...', requestId })
      const compactResult = await ctx.compactHistory(msgs, {
        apiKey: getApiKey(config),
        baseUrl: config.baseUrl,
        model: config.model,
        provider: config?.provider || 'openai',
      })
      if (compactResult.length < msgs.length) {
        msgs.splice(0, msgs.length, ...compactResult)
        return { retry: true }
      }
    }
    return null
  },
}

module.exports = { openaiAdapter }
