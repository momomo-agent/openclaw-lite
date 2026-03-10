// core/poll-backoff.js — Command poll backoff (OpenClaw-aligned)
// Exponential backoff: 5s → 10s → 30s → 60s (capped)

const BACKOFF_SCHEDULE_MS = [5000, 10000, 30000, 60000]

class PollBackoff {
  constructor() {
    this.counts = new Map()  // commandId → { count, lastPollAt }
  }

  /**
   * Record a poll and return suggested delay before next poll.
   * @param {string} commandId
   * @param {boolean} hasNewOutput
   * @returns {number} delay in ms
   */
  record(commandId, hasNewOutput) {
    const now = Date.now()
    if (hasNewOutput) {
      this.counts.set(commandId, { count: 0, lastPollAt: now })
      return BACKOFF_SCHEDULE_MS[0]
    }
    const existing = this.counts.get(commandId)
    const newCount = (existing?.count ?? -1) + 1
    this.counts.set(commandId, { count: newCount, lastPollAt: now })
    const index = Math.min(newCount, BACKOFF_SCHEDULE_MS.length - 1)
    return BACKOFF_SCHEDULE_MS[index]
  }

  /** Check if a poll should be skipped (too soon after last poll) */
  shouldSkip(commandId) {
    const existing = this.counts.get(commandId)
    if (!existing) return false
    const index = Math.min(existing.count, BACKOFF_SCHEDULE_MS.length - 1)
    const delay = BACKOFF_SCHEDULE_MS[index]
    return (Date.now() - existing.lastPollAt) < delay
  }

  clear(commandId) {
    this.counts.delete(commandId)
  }
}

module.exports = { PollBackoff, BACKOFF_SCHEDULE_MS }
