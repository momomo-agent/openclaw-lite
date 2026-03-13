// core/claude-code-sdk.js — Claude Agent SDK wrapper
// Elegant streaming interface for Claude Code integration

const { unstable_v2_createSession, unstable_v2_resumeSession } = require('@anthropic-ai/claude-agent-sdk')

/**
 * Claude Code session with streaming support.
 * Wraps the SDK's session API and maps events to simple callbacks.
 */
class ClaudeCodeSession {
  constructor({ cwd, sessionId, onToken, onDone, onError, model = 'claude-opus-4-6' }) {
    this.cwd = cwd
    this.existingSessionId = sessionId
    this.onToken = onToken
    this.onDone = onDone
    this.onError = onError
    this.model = model
    this.session = null
    this.sessionId = sessionId || null
  }

  /**
   * Send a message and stream the response.
   * Calls onToken for each text delta, onDone when complete.
   */
  async send(message) {
    try {
      // Create or resume session
      if (!this.session) {
        const opts = this._getOptions()
        this.session = this.existingSessionId
          ? unstable_v2_resumeSession(this.existingSessionId, opts)
          : unstable_v2_createSession(opts)
      }

      // Send message
      await this.session.send(message)

      // Stream response
      let output = ''
      for await (const msg of this.session.stream()) {
        if (msg.type === 'stream_event') {
          // Real-time text delta
          const delta = this._extractTextDelta(msg.event)
          if (delta) {
            output += delta
            if (this.onToken) this.onToken(delta)
          }
        } else if (msg.type === 'assistant') {
          // Complete assistant message
          const fullText = this._extractFullText(msg.message)
          if (this.onDone) this.onDone(fullText || output, { message: msg.message })
          break
        } else if (msg.type === 'result') {
          // Final result with metadata
          if (this.onDone) {
            this.onDone(msg.result || output, {
              usage: msg.usage,
              cost: msg.total_cost_usd,
              duration: msg.duration_ms,
              turns: msg.num_turns
            })
          }
          break
        }
      }

      // Capture session ID for resumption
      if (!this.sessionId && this.session.sessionId) {
        this.sessionId = this.session.sessionId
      }
    } catch (err) {
      if (this.onError) this.onError(err)
      throw err
    }
  }

  _getOptions() {
    return {
      model: this.model,
      env: {
        ...process.env,
        CLAUDE_CWD: this.cwd,
      },
      // Auto-allow all tools (bypass permissions for now)
      allowedTools: ['*'],
      // Permission callback — always allow
      canUseTool: async () => ({ allowed: true }),
    }
  }

  _extractTextDelta(event) {
    // Extract text from streaming event
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      return event.delta.text
    }
    return null
  }

  _extractFullText(message) {
    // Extract full text from complete message
    if (!message.content) return ''
    return message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
  }

  close() {
    if (this.session) {
      try {
        this.session.close()
      } catch {}
    }
  }

  [Symbol.asyncDispose]() {
    this.close()
  }
}

module.exports = { ClaudeCodeSession }
