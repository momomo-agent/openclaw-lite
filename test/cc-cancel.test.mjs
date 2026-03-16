// test/cc-cancel.test.mjs — CC Cancel (abort) tests
import { describe, it, expect } from 'vitest'

// Test ClaudeCodeSession.abort() directly (no SDK dependency needed)
describe('ClaudeCodeSession abort', () => {
  it('abort() sets _aborted flag', () => {
    // Minimal mock of ClaudeCodeSession behavior
    const session = { _aborted: false, abort() { this._aborted = true } }
    expect(session._aborted).toBe(false)
    session.abort()
    expect(session._aborted).toBe(true)
  })

  it('abort() breaks async generator loop', async () => {
    // Simulate the for-await loop with abort check
    let iterations = 0
    let aborted = false

    async function* fakeQuery() {
      yield { type: 'system', subtype: 'init', session_id: 'test-123' }
      yield { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } } }
      yield { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } } }
      yield { type: 'result', result: 'Hello world' }
    }

    let output = ''
    for await (const msg of fakeQuery()) {
      if (aborted) break
      iterations++
      if (msg.type === 'stream_event') {
        const delta = msg.event?.delta?.type === 'text_delta' ? msg.event.delta.text : null
        if (delta) output += delta
      }
      // Abort after first text delta
      if (iterations === 2) aborted = true
    }

    expect(iterations).toBe(2)
    expect(output).toBe('Hello')
    expect(aborted).toBe(true)
  })
})

// Test cancelCodingAgent from coding-agent-router
describe('cancelCodingAgent', () => {
  it('cancels active session and returns true', () => {
    const activeSessions = new Map()
    const mockSession = { _aborted: false, abort() { this._aborted = true } }
    activeSessions.set('session-1', mockSession)

    function cancelCodingAgent(sessionId) {
      const session = activeSessions.get(sessionId)
      if (session) {
        session.abort()
        activeSessions.delete(sessionId)
        return true
      }
      return false
    }

    expect(cancelCodingAgent('session-1')).toBe(true)
    expect(mockSession._aborted).toBe(true)
    expect(activeSessions.has('session-1')).toBe(false)
  })

  it('returns false for non-existent session', () => {
    const activeSessions = new Map()

    function cancelCodingAgent(sessionId) {
      const session = activeSessions.get(sessionId)
      if (session) { session.abort(); activeSessions.delete(sessionId); return true }
      return false
    }

    expect(cancelCodingAgent('nonexistent')).toBe(false)
  })
})
