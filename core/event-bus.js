// core/event-bus.js — Runtime event bus (singleton)
// Decouples main-process runtime from BrowserWindow.
// All IPC pushes go through here; a bridge forwards to any live window.

const EventEmitter = require('events')

class RuntimeEventBus extends EventEmitter {
  constructor() {
    super()
    this.setMaxListeners(50)
    this._recent = new Map()       // channel → data[] (last 50)
    this._latestStatus = new Map() // sessionId → watson-status payload
  }

  dispatch(channel, data) {
    this.emit(channel, data)
    // Cache recent events
    if (!this._recent.has(channel)) this._recent.set(channel, [])
    const arr = this._recent.get(channel)
    arr.push(data)
    if (arr.length > 50) arr.shift()
    // watson-status: keep latest per sessionId
    if (channel === 'watson-status' && data?.sessionId) {
      this._latestStatus.set(data.sessionId, data)
    }
  }

  getLatestStatuses() { return Object.fromEntries(this._latestStatus) }
  getRecent(channel) { return this._recent.get(channel) || [] }
  clearRecent() { this._recent.clear() }
}

module.exports = new RuntimeEventBus()
