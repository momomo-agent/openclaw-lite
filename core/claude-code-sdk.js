// core/claude-code-sdk.js — Claude Agent SDK wrapper
// Uses V1 query() API for real streaming support

const { query } = require('@anthropic-ai/claude-agent-sdk')

/**
 * Claude Code session with real-time streaming.
 * Uses V1 query() API which supports includePartialMessages.
 * (V2 session API hardcodes includePartialMessages=false internally)
 */
class ClaudeCodeSession {
  constructor({ cwd, sessionId, apiKey, baseUrl, onToken, onDone, onError, model = 'claude-opus-4-6' }) {
    this.cwd = cwd
    this.apiKey = apiKey
    this.baseUrl = baseUrl
    this.onToken = onToken
    this.onDone = onDone
    this.onError = onError
    this.model = model
    this.sessionId = sessionId || null
  }

  /**
   * Send a message and stream the response.
   * Returns the final text output.
   * If resume fails (stale session), retries without resume.
   */
  async send(message) {
    try {
      return await this._doSend(message)
    } catch (err) {
      // If resume failed, retry without resume
      if (this.sessionId && err.message && (err.message.includes('session') || err.message.includes('resume'))) {
        console.warn('[ClaudeCodeSession] Resume failed, retrying without resume:', err.message)
        this.sessionId = null
        return await this._doSend(message)
      }
      console.error('[ClaudeCodeSession] Error:', err)
      if (this.onError) this.onError(err)
      throw err
    }
  }

  async _doSend(message) {
    const env = {
      ...process.env,
      CLAUDECODE: undefined,  // Bypass nested session detection
    }
    if (this.apiKey) env.ANTHROPIC_AUTH_TOKEN = this.apiKey
    if (this.baseUrl) env.ANTHROPIC_BASE_URL = this.baseUrl

    const opts = {
      model: this.model,
      cwd: this.cwd,
      env,
      includePartialMessages: true,
      allowedTools: ['*'],
      permissionMode: 'bypassPermissions',
    }
    // Resume existing session if we have a sessionId
    if (this.sessionId) opts.resume = this.sessionId

    console.log('[ClaudeCodeSession] query() with:', { model: opts.model, cwd: opts.cwd, resume: opts.resume })

    let output = ''
    let resultText = ''
    let assistantText = ''

    for await (const msg of query({ prompt: message, options: opts })) {
      if (msg.type === 'system' && msg.subtype === 'init') {
        this.sessionId = msg.session_id
        console.log('[ClaudeCodeSession] Session:', this.sessionId)
      } else if (msg.type === 'stream_event') {
        // Real-time text delta from includePartialMessages
        const delta = this._extractTextDelta(msg.event)
        if (delta) {
          output += delta
          if (this.onToken) this.onToken(delta)
        }
      } else if (msg.type === 'assistant') {
        // Complete assistant message (non-streaming fallback)
        assistantText = this._extractFullText(msg.message)
      } else if (msg.type === 'result') {
        resultText = msg.result || ''
      }
    }

    const finalText = resultText || assistantText || output
    if (this.onDone) this.onDone(finalText, {})
    return finalText
  }

  _extractTextDelta(event) {
    if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      return event.delta.text
    }
    return null
  }

  _extractFullText(message) {
    if (!message?.content) return ''
    const text = message.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
    return text || message.content
      .filter(b => b.type === 'thinking')
      .map(b => b.thinking)
      .join('\n\n')
  }

  close() {
    // V1 query() is an async generator — no explicit close needed
  }
}

module.exports = { ClaudeCodeSession }
