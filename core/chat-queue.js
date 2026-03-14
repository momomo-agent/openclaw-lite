// core/chat-queue.js — Per-session message queue (OpenClaw-aligned)
//
// When the AI is replying, new user messages are queued and drained
// sequentially after the current reply finishes. This prevents:
// - Concurrent API calls for the same session
// - Race conditions in streaming state
// - Lost messages when typing faster than the AI
//
// Design: "collect" mode — queue messages while busy,
// drain them one-by-one when the current reply completes.

class ChatQueue {
  constructor() {
    // sessionId → { active: bool, queue: Array<{message, requestId, ...}>, draining: bool }
    this._sessions = new Map()
  }

  _getSession(sessionId) {
    if (!this._sessions.has(sessionId)) {
      this._sessions.set(sessionId, { active: false, queue: [], draining: false })
    }
    return this._sessions.get(sessionId)
  }

  /** Mark session as active (AI is replying) */
  markActive(sessionId) {
    this._getSession(sessionId).active = true
  }

  /** Mark session as idle (AI finished replying) */
  markIdle(sessionId) {
    const s = this._getSession(sessionId)
    s.active = false
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

  /** Drain: pop the next queued message. Returns null if empty. */
  shift(sessionId) {
    const s = this._getSession(sessionId)
    return s.queue.shift() || null
  }

  /** Clear all queued messages for a session */
  clear(sessionId) {
    const s = this._getSession(sessionId)
    s.queue = []
  }

  /** Start draining — returns false if already draining */
  startDrain(sessionId) {
    const s = this._getSession(sessionId)
    if (s.draining) return false
    s.draining = true
    return true
  }

  stopDrain(sessionId) {
    this._getSession(sessionId).draining = false
  }

  isDraining(sessionId) {
    return this._getSession(sessionId).draining
  }

  /** Get status summary */
  status(sessionId) {
    const s = this._getSession(sessionId)
    return { active: s.active, queued: s.queue.length, draining: s.draining }
  }
}

module.exports = { ChatQueue }
