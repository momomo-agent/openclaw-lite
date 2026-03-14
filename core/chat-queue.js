// core/chat-queue.js — Per-session message queue (OpenClaw-aligned collect mode)
//
// When the AI is replying, new user messages are queued. When the current
// reply finishes, ALL queued messages are drained at once and merged into
// a single "collect" prompt (OpenClaw-style numbered format). This prevents:
// - Concurrent API calls for the same session
// - Race conditions in streaming state
// - Lost messages when typing faster than the AI
// - Redundant per-message API calls (N queued → 1 merged request)

class ChatQueue {
  constructor() {
    // sessionId → { active: bool, queue: Array<{prompt, requestId, ...}> }
    this._sessions = new Map()
  }

  _getSession(sessionId) {
    if (!this._sessions.has(sessionId)) {
      this._sessions.set(sessionId, { active: false, queue: [] })
    }
    return this._sessions.get(sessionId)
  }

  /** Mark session as active (AI is replying) */
  markActive(sessionId) {
    this._getSession(sessionId).active = true
  }

  /** Mark session as idle (AI finished replying) */
  markIdle(sessionId) {
    this._getSession(sessionId).active = false
  }

  /** Check if session has an active reply in progress */
  isActive(sessionId) {
    return this._getSession(sessionId).active
  }

  /** Enqueue a message for later processing. Returns true if queued, false if should run now. */
  enqueue(sessionId, item) {
    const s = this._getSession(sessionId)
    if (!s.active) return false // not busy, run immediately
    s.queue.push(item)
    return true
  }

  /** Get queue depth for a session */
  depth(sessionId) {
    return this._getSession(sessionId).queue.length
  }

  /** Drain all queued messages at once. Returns [] if empty. */
  shiftAll(sessionId) {
    const s = this._getSession(sessionId)
    const items = s.queue.slice()
    s.queue = []
    return items
  }

  /** Clear all queued messages for a session */
  clear(sessionId) {
    this._getSession(sessionId).queue = []
  }

  /** Get status summary */
  status(sessionId) {
    const s = this._getSession(sessionId)
    return { active: s.active, queued: s.queue.length }
  }
}

module.exports = { ChatQueue }
