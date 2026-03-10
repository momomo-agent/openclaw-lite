// core/session-expiry.js — Session auto-expiry (daily reset + idle timeout)
// OpenClaw-aligned: configurable dailyResetHour + idleMinutes

class SessionExpiry {
  constructor(opts = {}) {
    this.dailyResetHour = opts.dailyResetHour ?? 4  // 4 AM local
    this.idleMinutes = opts.idleMinutes ?? 180       // 3 hours idle
    this.lastActivityAt = Date.now()
    this.sessionStartDate = this._todayString()
  }

  _todayString() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  /** Record user/assistant activity */
  touch() {
    this.lastActivityAt = Date.now()
  }

  /** Check if session should be reset. Returns reason string or null. */
  shouldReset() {
    const now = new Date()

    // Daily reset: if current date differs AND we're past resetHour
    const today = this._todayString()
    if (today !== this.sessionStartDate && now.getHours() >= this.dailyResetHour) {
      return `daily_reset (date changed from ${this.sessionStartDate} to ${today})`
    }

    // Idle timeout
    if (this.idleMinutes > 0) {
      const idleMs = Date.now() - this.lastActivityAt
      if (idleMs > this.idleMinutes * 60_000) {
        return `idle_timeout (${Math.round(idleMs / 60_000)}m idle, limit ${this.idleMinutes}m)`
      }
    }

    return null
  }

  /** Reset the session tracking (call after actually clearing messages) */
  reset() {
    this.lastActivityAt = Date.now()
    this.sessionStartDate = this._todayString()
  }
}

module.exports = { SessionExpiry }
