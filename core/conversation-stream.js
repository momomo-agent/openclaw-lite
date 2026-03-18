/**
 * core/conversation-stream.js — Unified conversation message stream
 *
 * The single API for all message read/write operations in a chat session.
 * Hides DB operations behind append/update/finalize semantics.
 *
 * Design:
 * - append(msg) → write to DB immediately, return stable msgId
 * - update(msgId, delta) → buffer in memory (no DB write per token)
 * - finalize(msgId) → flush buffered content to DB
 * - read() / readForDelegate() → returns DB + in-flight messages
 *
 * IDs: self-generated `msg-{timestamp}-{random}` format.
 * Stable across streaming → DB → UI reload.
 */

let _sessionStore = null
function _getSessionStore() {
  if (!_sessionStore) _sessionStore = require('../session-store')
  return _sessionStore
}

let _idCounter = 0
function generateMsgId() {
  return `msg-${Date.now().toString(36)}-${(++_idCounter).toString(36)}`
}

class ConversationStream {
  /**
   * @param {string} sessionId
   * @param {string} dbPath — workspace/clawDir path for session-store
   */
  constructor(sessionId, dbPath) {
    this._sessionId = sessionId
    this._dbPath = dbPath
    // In-flight message buffers: msgId → { content, toolSteps, dirty }
    this._inflight = new Map()
    // Ordered list of msgIds appended this turn (for readForDelegate)
    this._turnMessages = []
    // Session status — single source of truth (Phase 3)
    this._status = { sender: null, text: '', level: 'idle' }
    // Last message tracking — replaces SQL subquery for sidebar (Phase 3)
    this._lastMsg = { content: '', sender: '', senderWsId: '' }
  }

  /**
   * Append a new message to the conversation.
   * Writes to DB immediately to secure position (row ID = ordering).
   * Returns the stable msgId.
   *
   * @param {Object} msg - { role, content, sender, senderWorkspaceId, toolSteps, ... }
   * @returns {string} msgId
   */
  append(msg) {
    const msgId = generateMsgId()
    const store = _getSessionStore()
    const { role, content, sender, senderWorkspaceId, toolSteps, ...extra } = msg
    const meta = { ...extra, msgId }
    if (sender) meta.sender = sender
    if (senderWorkspaceId) meta.senderWorkspaceId = senderWorkspaceId
    if (toolSteps?.length) meta.toolSteps = toolSteps

    store.appendMessage(this._dbPath, this._sessionId, {
      role: role || 'assistant',
      content: content || '',
      timestamp: msg.timestamp || Date.now(),
      ...meta,
    })

    this._turnMessages.push(msgId)

    // Track last message for sidebar summary (Phase 3)
    if ((content || '').trim()) {
      this._lastMsg = {
        content: (content || '').slice(0, 60),
        sender: sender || '',
        senderWsId: senderWorkspaceId || '',
      }
      this._emitSummary()
    }

    console.log(`[ConversationStream] append: msgId=${msgId} role=${role} sender=${sender || '-'} len=${(content || '').length}`)
    return msgId
  }

  /**
   * Update an in-flight message (streaming tokens).
   * Buffers in memory — does NOT write to DB on every call.
   *
   * @param {string} msgId
   * @param {Object} delta - { content?, toolSteps?, ... }
   */
  update(msgId, delta) {
    let entry = this._inflight.get(msgId)
    if (!entry) {
      entry = { content: null, toolSteps: null, meta: {} }
      this._inflight.set(msgId, entry)
    }
    if (delta.content !== undefined) entry.content = delta.content
    if (delta.toolSteps !== undefined) entry.toolSteps = delta.toolSteps
    for (const [k, v] of Object.entries(delta)) {
      if (k !== 'content' && k !== 'toolSteps') entry.meta[k] = v
    }
    entry.dirty = true
  }

  /**
   * Finalize a single message — flush buffered updates to DB.
   *
   * @param {string} msgId
   */
  finalize(msgId) {
    const entry = this._inflight.get(msgId)
    if (!entry || !entry.dirty) {
      this._inflight.delete(msgId)
      return
    }

    const store = _getSessionStore()
    // Find the DB row by msgId in metadata
    const updates = {}
    if (entry.content !== null) updates.content = entry.content
    if (entry.toolSteps !== null) updates.toolSteps = entry.toolSteps
    Object.assign(updates, entry.meta)

    store.updateMessageByMsgId(this._dbPath, this._sessionId, msgId, updates)
    this._inflight.delete(msgId)
    console.log(`[ConversationStream] finalize: msgId=${msgId} contentLen=${(entry.content || '').length}`)
  }

  /**
   * Finalize ALL in-flight messages. Called at end of chat turn.
   */
  finalizeAll() {
    for (const msgId of this._inflight.keys()) {
      this.finalize(msgId)
    }
    this._turnMessages = []
  }

  /**
   * Read recent messages (DB + in-flight overlays).
   * Returns messages in DB order with any pending updates applied.
   *
   * @param {number} limit
   * @returns {Array}
   */
  read(limit = 50) {
    const store = _getSessionStore()
    const session = store.loadSession(this._dbPath, this._sessionId)
    const messages = session?.messages || []

    // Apply in-flight overlays
    for (const msg of messages) {
      const msgId = msg.msgId
      if (msgId && this._inflight.has(msgId)) {
        const entry = this._inflight.get(msgId)
        if (entry.content !== null) msg.content = entry.content
        if (entry.toolSteps !== null) msg.toolSteps = entry.toolSteps
        Object.assign(msg, entry.meta)
      }
    }

    return messages.slice(-limit)
  }

  /**
   * Read curated context for a delegate participant.
   * - User messages labeled as [User to group]
   * - Assistant messages labeled with sender
   * - In-flight messages included (so Paul sees Alice's reply)
   * - Delegation instruction as final message
   *
   * @param {string} ownerName - group owner name
   * @param {string} delegateName - this delegate's name
   * @param {string} delegationMessage - what the owner is asking
   * @param {number} limit
   * @returns {Array} messages formatted for LLM context
   */
  readForDelegate(ownerName, delegateName, delegationMessage, limit = 20) {
    const allMessages = this.read(limit)
    const result = []

    for (const m of allMessages) {
      if (m.role === 'user') {
        result.push({
          role: 'user',
          content: `[User to group]: ${m.content}`
        })
      } else if (m.role === 'assistant') {
        const sender = m.sender || ownerName
        result.push({
          role: 'assistant',
          content: `[${sender}]: ${m.content || ''}`
        })
      }
    }

    // The actual delegation instruction
    result.push({
      role: 'user',
      content: `[${ownerName} to you]: ${delegationMessage}`
    })

    return result
  }

  // ── Phase 3: Status + Summary ──────────────────────────────

  /**
   * Set session status (who's doing what).
   * Single source of truth — replaces pushStatus/pushWatsonStatus for stream sessions.
   */
  setStatus(sender, text, level) {
    this._status = { sender: sender || null, text: text || '', level: level || 'idle' }
    this._emitSummary()
  }

  clearStatus() { this.setStatus(null, '', 'idle') }

  getStatus() { return { ...this._status } }

  /**
   * Get sidebar summary — replaces SQL subquery + scattered events.
   */
  getSummary() {
    return {
      sessionId: this._sessionId,
      lastMessage: this._lastMsg.content,
      lastSender: this._lastMsg.sender,
      lastSenderWsId: this._lastMsg.senderWsId,
      statusText: this._status.text,
      statusSender: this._status.sender,
      activity: this._status.level,
    }
  }

  _emitSummary() {
    const eventBus = require('./event-bus')
    eventBus.dispatch('session-summary', this.getSummary())
  }

  /**
   * Get the sessionId this stream is bound to.
   */
  get sessionId() {
    return this._sessionId
  }

  /**
   * Get the dbPath this stream is bound to.
   */
  get dbPath() {
    return this._dbPath
  }
}

module.exports = { ConversationStream, generateMsgId }
