/**
 * core/provider-anthropic.js — Anthropic SSE adapter for StreamOrchestrator
 *
 * Handles: request construction, SSE parsing, message formatting, error handling.
 * All tool loop logic lives in stream-orchestrator.js.
 */
const { getApiKey } = require('./api-keys')
const { enforceContextBudget } = require('./context-guard')
const { resolveContextWindow } = require('./model-context')
const { sanitizeTranscript } = require('./transcript-repair')

const anthropicAdapter = {
  name: 'anthropic',

  /**
   * Initialize messages — sanitize transcript for Anthropic format.
   */
  initMessages(messages, systemPrompt, config, ctx) {
    return sanitizeTranscript([...messages], {
      historyLimit: config?.historyLimit,
      provider: 'anthropic',
      removeTrailingUser: false,
    })
  },

  /**
   * Build the HTTP request for a round.
   */
  prepareRequest(round, msgs, systemPrompt, tools, config, ctx) {
    const base = (config.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')
    const endpoint = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`

    // System with cache_control
    const scrubbedSystem = ctx.scrubMagicStrings(systemPrompt)
    const systemContent = scrubbedSystem ? [
      { type: 'text', text: scrubbedSystem, cache_control: { type: 'ephemeral' } }
    ] : undefined

    // Tools with cache_control on last
    const cachedTools = tools.map((t, i) =>
      i === tools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t
    )

    // Messages — scrub magic strings + cache last user message
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

    // Context budget
    const contextWindowTokens = resolveContextWindow(config)
    enforceContextBudget(cachedMsgs, contextWindowTokens)

    return {
      url: endpoint,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getApiKey(config),
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: {
        model: config.model || 'claude-sonnet-4-20250514',
        max_tokens: config.maxTokens || 4096,
        stream: true,
        system: systemContent,
        messages: cachedMsgs,
        tools: cachedTools,
      },
    }
  },

  /**
   * Parse a single SSE line into normalized events.
   */
  parseSSE(line, state) {
    if (!line.startsWith('data: ')) return []
    const events = []
    try {
      const evt = JSON.parse(line.slice(6))

      // Usage from message_start
      if (evt.type === 'message_start' && evt.message?.usage) {
        events.push({
          type: 'usage',
          usage: {
            inputTokens: evt.message.usage.input_tokens || 0,
            cacheRead: evt.message.usage.cache_read_input_tokens || 0,
            cacheWrite: evt.message.usage.cache_creation_input_tokens || 0,
          },
        })
      }

      // Usage from message_delta
      if (evt.type === 'message_delta' && evt.usage) {
        events.push({
          type: 'usage',
          usage: { outputTokens: evt.usage.output_tokens || 0 },
        })
      }

      // Tool start
      if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
        events.push({
          type: 'tool_start',
          tool: { id: evt.content_block.id, name: evt.content_block.name },
        })
      }

      // Content delta
      if (evt.type === 'content_block_delta') {
        if (evt.delta?.type === 'thinking_delta' && evt.delta?.thinking) {
          events.push({ type: 'thinking', text: evt.delta.thinking })
        }
        if (evt.delta?.text && !state.curTool) {
          events.push({ type: 'text', text: evt.delta.text })
        }
        if (evt.delta?.partial_json && state.curTool) {
          events.push({ type: 'tool_delta', json: evt.delta.partial_json })
        }
      }

      // Tool end
      if (evt.type === 'content_block_stop' && state.curTool) {
        events.push({ type: 'tool_end' })
      }
    } catch {}
    return events
  },

  /**
   * Build Anthropic-format assistant message with tool calls.
   */
  buildAssistantMsg(roundText, toolCalls) {
    const content = []
    if (roundText) content.push({ type: 'text', text: roundText })
    for (const tc of toolCalls) {
      content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: JSON.parse(tc.json || '{}') })
    }
    return { role: 'assistant', content }
  },

  /**
   * Build a single tool result entry.
   */
  buildToolResult(toolCallId, content) {
    return { type: 'tool_result', tool_use_id: toolCallId, content }
  },

  /**
   * Build tool result with image (Anthropic supports multi-part content).
   */
  buildToolResultWithImage(toolCallId, result, ctx) {
    return {
      type: 'tool_result',
      tool_use_id: toolCallId,
      content: [
        { type: 'text', text: ctx.truncateToolResult(result.result || result.error || 'Done') },
        { type: 'image', source: result.image },
      ],
    }
  },

  /**
   * Append tool results as a single user message (Anthropic format).
   */
  appendToolResults(msgs, toolResultMsgs) {
    msgs.push({ role: 'user', content: toolResultMsgs })
  },

  /**
   * Handle API errors — may attempt compaction for context overflow.
   */
  async handleError(status, body, ctx, msgs, ipc, requestId, config) {
    if (ctx.isContextOverflowError(status, body)) {
      console.warn('[Paw] Context overflow detected, attempting compaction...')
      ipc('chat-status', { text: '上下文溢出，压缩中...', requestId })
      const compactResult = await ctx.compactHistory(msgs, {
        apiKey: getApiKey(config),
        baseUrl: config.baseUrl,
        model: config.model,
        provider: 'anthropic',
      })
      if (compactResult.length < msgs.length) {
        msgs.splice(0, msgs.length, ...compactResult)
        return { retry: true }
      }
    }
    return null
  },
}

module.exports = { anthropicAdapter }
