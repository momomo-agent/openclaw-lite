/**
 * test/e2e/mock-api.mjs — Mock Anthropic API server for E2E tests
 *
 * Returns deterministic streaming responses so tests don't need real API keys.
 * Supports: messages (streaming SSE), basic tool_use responses.
 *
 * Usage: node test/e2e/mock-api.mjs [--port 8765] [--error-mode normal|rate-limit|auth-fail|overloaded]
 */
import http from 'http'

const PORT = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '8765')
const ERROR_MODE = process.argv.find(a => a.startsWith('--error-mode='))?.split('=')[1] || 'normal'

// ── Response generators ──

function sseEvent(type, data) {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
}

function makeStreamingResponse(text, inputTokens = 50, outputTokens = 20) {
  const msgId = 'msg_e2e_' + Date.now()
  const events = []

  events.push(sseEvent('message_start', {
    type: 'message_start',
    message: {
      id: msgId, type: 'message', role: 'assistant', model: 'claude-sonnet-4-20250514',
      content: [], stop_reason: null,
      usage: { input_tokens: inputTokens, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    }
  }))

  events.push(sseEvent('content_block_start', {
    type: 'content_block_start', index: 0,
    content_block: { type: 'text', text: '' }
  }))

  // Stream text in chunks
  const chunks = text.match(/.{1,15}/g) || [text]
  for (const chunk of chunks) {
    events.push(sseEvent('content_block_delta', {
      type: 'content_block_delta', index: 0,
      delta: { type: 'text_delta', text: chunk }
    }))
  }

  events.push(sseEvent('content_block_stop', { type: 'content_block_stop', index: 0 }))

  events.push(sseEvent('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: outputTokens }
  }))

  events.push(sseEvent('message_stop', { type: 'message_stop' }))

  return events.join('')
}

function makeToolUseResponse(toolName, toolInput, thinkingText) {
  const msgId = 'msg_e2e_tool_' + Date.now()
  const toolId = 'toolu_e2e_' + Date.now()
  const events = []

  events.push(sseEvent('message_start', {
    type: 'message_start',
    message: {
      id: msgId, type: 'message', role: 'assistant', model: 'claude-sonnet-4-20250514',
      content: [], stop_reason: null,
      usage: { input_tokens: 100, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    }
  }))

  // Optional thinking text before tool use
  if (thinkingText) {
    events.push(sseEvent('content_block_start', {
      type: 'content_block_start', index: 0,
      content_block: { type: 'text', text: '' }
    }))
    events.push(sseEvent('content_block_delta', {
      type: 'content_block_delta', index: 0,
      delta: { type: 'text_delta', text: thinkingText }
    }))
    events.push(sseEvent('content_block_stop', { type: 'content_block_stop', index: 0 }))
  }

  // Tool use block
  const blockIndex = thinkingText ? 1 : 0
  events.push(sseEvent('content_block_start', {
    type: 'content_block_start', index: blockIndex,
    content_block: { type: 'tool_use', id: toolId, name: toolName, input: {} }
  }))
  events.push(sseEvent('content_block_delta', {
    type: 'content_block_delta', index: blockIndex,
    delta: { type: 'input_json_delta', partial_json: JSON.stringify(toolInput) }
  }))
  events.push(sseEvent('content_block_stop', { type: 'content_block_stop', index: blockIndex }))

  events.push(sseEvent('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: 'tool_use', stop_sequence: null },
    usage: { output_tokens: 50 }
  }))

  events.push(sseEvent('message_stop', { type: 'message_stop' }))

  return events.join('')
}

// ── Request routing ──

/** Determine response based on user's last message */
function routeResponse(messages) {
  const lastUser = [...messages].reverse().find(m => m.role === 'user')
  const text = typeof lastUser?.content === 'string'
    ? lastUser.content
    : (lastUser?.content || []).map(b => b.text || '').join(' ')
  const lower = text.toLowerCase()

  // Tool result follow-up — after a tool_use, return the final text response
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
  const hasToolResult = messages.some(m => m.role === 'user' && Array.isArray(m.content) && m.content.some(b => b.type === 'tool_result'))
  if (hasToolResult) {
    if (lower.includes('soul.md') || lower.includes('file')) {
      return makeStreamingResponse('The first line of SOUL.md is: "# SOUL.md — Momo". This appears to be a personality configuration file for an AI assistant named Momo.')
    }
    return makeStreamingResponse('I\'ve completed the requested action. The tool returned the expected results.')
  }

  // File read request → return tool_use
  if (lower.includes('read') && lower.includes('soul.md')) {
    return makeToolUseResponse('file_read', { path: 'SOUL.md' }, 'Let me read that file for you.')
  }
  if (lower.includes('read') && lower.includes('file')) {
    return makeToolUseResponse('file_read', { path: 'SOUL.md' }, 'I\'ll read that file.')
  }

  // Delegate test
  if (lower.includes('delegate') || lower.includes('ask alice') || lower.includes('ask bob')) {
    const target = lower.includes('alice') ? 'Alice' : 'Bob'
    return makeToolUseResponse('delegate_to', { participant_name: target, message: text }, `Let me ask ${target}.`)
  }

  // Simple echo/test responses
  if (lower.includes('paw test ok')) {
    return makeStreamingResponse('paw test ok')
  }

  // Queued messages (collect mode) — respond acknowledging all (avoid "queued" in response text for E2E test)
  if (lower.includes('queued messages while agent was busy') || lower.includes('queued #')) {
    const matches = text.match(/Queued #\d+/g) || []
    return makeStreamingResponse(`Received ${matches.length} messages in batch. Processing them together.`)
  }

  if (lower.includes('reply a')) {
    return makeStreamingResponse('reply A')
  }
  if (lower.includes('reply b')) {
    return makeStreamingResponse('reply B')
  }
  if (lower.includes('reply c')) {
    return makeStreamingResponse('reply C')
  }

  if (lower.includes('hello') || lower.includes('hi')) {
    return makeStreamingResponse('Hello! I\'m your Paw assistant. How can I help you today?')
  }

  // Default
  return makeStreamingResponse('I received your message and I\'m ready to help. What would you like to work on?')
}

// ── Server ──

let requestCount = 0

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  if (req.method === 'POST' && req.url === '/v1/messages') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      requestCount++
      try {
        const parsed = JSON.parse(body)
        const messages = parsed.messages || []

        console.log(`[mock-api] #${requestCount} | ${messages.length} messages | stream=${parsed.stream} | mode=${ERROR_MODE}`)

        // Error modes
        if (ERROR_MODE === 'rate-limit') {
          res.writeHead(429, { 'Content-Type': 'application/json', 'retry-after': '1' })
          res.end(JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'Rate limit exceeded. Please retry after 30 seconds.' } }))
          return
        }
        if (ERROR_MODE === 'auth-fail') {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'Invalid API key provided.' } }))
          return
        }
        if (ERROR_MODE === 'overloaded') {
          res.writeHead(529, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Anthropic API is temporarily overloaded.' } }))
          return
        }

        if (parsed.stream) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          })

          const responseSSE = routeResponse(messages)

          // Stream with delays to simulate real API
          const events = responseSSE.split('\n\n').filter(Boolean)
          let i = 0
          const sendNext = () => {
            if (i >= events.length) {
              res.end()
              return
            }
            res.write(events[i] + '\n\n')
            i++
            // Slower for E2E queue testing — ensure messages can queue
            const delay = process.env.E2E_SLOW_STREAM ? 100 + Math.random() * 100 : 10 + Math.random() * 20
            setTimeout(sendNext, delay)
          }
          sendNext()
        } else {
          // Non-streaming (not used by Paw, but handle gracefully)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            id: 'msg_e2e_' + Date.now(), type: 'message', role: 'assistant',
            content: [{ type: 'text', text: 'Mock response (non-streaming)' }],
            model: 'claude-sonnet-4-20250514', stop_reason: 'end_turn',
            usage: { input_tokens: 50, output_tokens: 10 }
          }))
        }
      } catch (err) {
        console.error('[mock-api] parse error:', err.message)
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: err.message } }))
      }
    })
    return
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, requests: requestCount }))
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

server.listen(PORT, () => {
  console.log(`[mock-api] Anthropic mock server on http://127.0.0.1:${PORT}`)
  console.log(`[mock-api] Configure Paw: baseUrl=http://127.0.0.1:${PORT}`)
})
