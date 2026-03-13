// Session Store — SQLite backend (aligned with OpenClaw)
const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')

const dbCache = new Map()

function getDb(clawDir) {
  if (!clawDir) return null
  const target = path.resolve(clawDir, '.paw', 'sessions.db')
  if (dbCache.has(target)) return dbCache.get(target)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const db = new Database(target)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  ensureSchema(db)
  dbCache.set(target, db)
  return db
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      mode TEXT DEFAULT 'chat',
      status_level TEXT DEFAULT 'idle',
      status_text TEXT DEFAULT '',
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      participants TEXT DEFAULT '[]'
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      metadata TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id)`)
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_agents (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_session_agents_session ON session_agents(session_id)`)
  // Migrations: add columns if missing (idempotent — ALTER fails if column exists)
  const migrations = [
    `ALTER TABLE sessions ADD COLUMN mode TEXT DEFAULT 'chat'`,
    `ALTER TABLE sessions ADD COLUMN participants TEXT DEFAULT '[]'`,
    `ALTER TABLE sessions ADD COLUMN input_tokens INTEGER DEFAULT 0`,
    `ALTER TABLE sessions ADD COLUMN output_tokens INTEGER DEFAULT 0`,
  ]
  for (const sql of migrations) {
    try { db.exec(sql) } catch (e) {
      // "duplicate column name" is expected if migration already ran — only log unexpected errors
      if (e.message && !e.message.includes('duplicate column')) {
        console.warn('[session-store] migration warning:', e.message)
      }
    }
  }
}

function _parseParticipants(raw) {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

/**
 * Migrate ca: prefixed participant IDs to workspace IDs.
 * Called lazily when reading participants.
 * ca:engine:/path → look up workspace by engine+path → use workspace.id
 */
function _migrateParticipantIds(db, sessionId, pids) {
  let changed = false
  const migrated = pids.map(pid => {
    if (!pid || !pid.startsWith('ca:')) return pid
    const parts = pid.split(':')
    if (parts.length < 3) return pid
    const engine = parts[1]
    const workdir = parts.slice(2).join(':')
    // Lazy-require to avoid circular deps
    const wsRegistry = require('./core/workspace-registry')
    const ws = wsRegistry.findCodingAgentWorkspace(engine, workdir)
    if (ws) { changed = true; return ws.id }
    // If workspace not found, create one on-the-fly
    const newWs = wsRegistry.addCodingAgentWorkspace(engine, workdir)
    if (newWs) { changed = true; return newWs.id }
    return pid // fallback: keep old format
  })
  // Persist migrated IDs back to DB
  if (changed && db) {
    try {
      db.prepare('UPDATE sessions SET participants = ? WHERE id = ?').run(JSON.stringify(migrated), sessionId)
      console.log(`[session-store] Migrated ca: participant IDs for session ${sessionId}`)
    } catch (err) {
      console.warn('[session-store] participant migration error:', err.message)
    }
  }
  return migrated
}

function listSessions(clawDir, { workspaceId } = {}) {
  const d = getDb(clawDir)
  if (!d) return []
  const sessions = d.prepare(`
    SELECT s.id, s.title, s.created_at as createdAt, s.updated_at as updatedAt,
           s.mode, s.status_level as statusLevel, s.status_text as statusText, s.participants,
           (SELECT substr(m.content, 1, 60) FROM messages m WHERE m.session_id = s.id ORDER BY m.id DESC LIMIT 1) as lastMessage,
           (SELECT json_extract(m.metadata, '$.sender') FROM messages m WHERE m.session_id = s.id ORDER BY m.id DESC LIMIT 1) as lastSender,
           (SELECT json_extract(m.metadata, '$.senderWorkspaceId') FROM messages m WHERE m.session_id = s.id ORDER BY m.id DESC LIMIT 1) as lastSenderWsId
    FROM sessions s ORDER BY s.updated_at DESC
  `).all()
  for (const s of sessions) {
    const raw = _parseParticipants(s.participants)
    // Migrate ca: prefixed IDs to workspace IDs on read
    s.participants = raw.some(p => typeof p === 'string' && p.startsWith('ca:'))
      ? _migrateParticipantIds(d, s.id, raw)
      : raw
  }
  if (workspaceId) {
    return sessions.filter(s => s.participants.includes(workspaceId))
  }
  return sessions
}

function loadSession(clawDir, id) {
  const d = getDb(clawDir)
  if (!d) return null
  const session = d.prepare('SELECT id, title, mode, created_at as createdAt, updated_at as updatedAt, participants FROM sessions WHERE id = ?').get(id)
  if (!session) return null
  session.participants = _parseParticipants(session.participants)
  // Migrate ca: prefixed IDs to workspace IDs on read
  if (session.participants.some(p => typeof p === 'string' && p.startsWith('ca:'))) {
    session.participants = _migrateParticipantIds(d, id, session.participants)
  }
  const rows = d.prepare('SELECT id, role, content, timestamp, metadata FROM messages WHERE session_id = ? ORDER BY id').all(id)
  session.messages = rows.map(r => {
    const msg = { id: String(r.id), role: r.role, content: r.content, timestamp: r.timestamp }
    if (r.metadata) try { Object.assign(msg, JSON.parse(r.metadata)) } catch {}
    return msg
  })
  return session
}

function saveSession(clawDir, session) {
  const d = getDb(clawDir)
  if (!d) return
  const now = Date.now()
  session.updatedAt = now
  const participants = JSON.stringify(session.participants || [])
  const mode = session.mode || 'chat'
  d.prepare('INSERT INTO sessions (id, title, mode, created_at, updated_at, participants) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, mode=excluded.mode, updated_at=excluded.updated_at, participants=excluded.participants')
    .run(session.id, session.title || '', mode, session.createdAt || now, now, participants)
  // Replace all messages
  d.prepare('DELETE FROM messages WHERE session_id = ?').run(session.id)
  const insert = d.prepare('INSERT INTO messages (session_id, role, content, timestamp, metadata) VALUES (?, ?, ?, ?, ?)')
  const tx = d.transaction((msgs) => {
    for (const m of msgs) {
      const { role, content, timestamp, ...rest } = m
      const meta = Object.keys(rest).length ? JSON.stringify(rest) : null
      insert.run(session.id, role || 'user', typeof content === 'string' ? content : JSON.stringify(content), timestamp || now, meta)
    }
  })
  tx(session.messages || [])
}

function appendMessage(clawDir, sessionId, msg) {
  const d = getDb(clawDir)
  if (!d) { console.error('[session-store] appendMessage: no db for', clawDir); return }
  const now = Date.now()
  const { role, content, timestamp, ...rest } = msg
  const meta = Object.keys(rest).length ? JSON.stringify(rest) : null
  try {
    d.prepare('INSERT INTO messages (session_id, role, content, timestamp, metadata) VALUES (?, ?, ?, ?, ?)')
      .run(sessionId, role || 'user', typeof content === 'string' ? content : JSON.stringify(content), timestamp || now, meta)
    d.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, sessionId)
    console.log(`[session-store] appendMessage OK: session=${sessionId} role=${role} len=${(content||'').length}`)
  } catch (err) {
    console.error('[session-store] appendMessage FAILED:', err.message, { clawDir, sessionId, role })
  }
}

// Update message metadata (merge fields into existing metadata)
// Usage: updateMessageMeta(clawDir, sessionId, msgId, { status: 'failed' })
//        updateMessageMeta(clawDir, sessionId, msgId, { status: null }) // clear
function updateMessageMeta(clawDir, sessionId, msgId, fields) {
  const d = getDb(clawDir)
  if (!d) return
  const row = d.prepare('SELECT metadata FROM messages WHERE id = ? AND session_id = ?').get(msgId, sessionId)
  if (!row) return
  let meta = {}
  if (row.metadata) try { meta = JSON.parse(row.metadata) } catch {}
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined) delete meta[k]
    else meta[k] = v
  }
  const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : null
  d.prepare('UPDATE messages SET metadata = ? WHERE id = ?').run(metaStr, msgId)
}

// Delete a specific message by id
function deleteMessage(clawDir, sessionId, messageId) {
  const d = getDb(clawDir)
  if (!d) return
  d.prepare('DELETE FROM messages WHERE id = ? AND session_id = ?').run(messageId, sessionId)
}

// Find last message of a role in a session
function findLastMessage(clawDir, sessionId, role) {
  const d = getDb(clawDir)
  if (!d) return null
  return d.prepare('SELECT id, role, content, timestamp, metadata FROM messages WHERE session_id = ? AND role = ? ORDER BY id DESC LIMIT 1').get(sessionId, role) || null
}

function deleteSession(clawDir, id) {
  const d = getDb(clawDir)
  if (!d) return
  d.prepare('DELETE FROM sessions WHERE id = ?').run(id)
  // Clean up session directory
  const sessionDir = path.join(clawDir, '.paw', 'sessions', id)
  try { fs.rmSync(sessionDir, { recursive: true, force: true }) } catch {}
}

function renameSession(clawDir, id, title) {
  const d = getDb(clawDir)
  if (!d) return
  d.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, id)
}

function getSessionTitle(clawDir, id) {
  const d = getDb(clawDir)
  if (!d) return null
  const row = d.prepare('SELECT title FROM sessions WHERE id = ?').get(id)
  return row?.title || null
}

function createSession(clawDir, title, { participants, mode } = {}) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const now = Date.now()
  const wsIds = participants || []
  const session = { id, title: title || '', messages: [], createdAt: now, updatedAt: now, participants: wsIds, mode: mode || 'chat' }
  saveSession(clawDir, session)
  // Create session directory for tool file storage
  const sessionDir = path.join(clawDir, '.paw', 'sessions', id)
  fs.mkdirSync(sessionDir, { recursive: true })
  return session
}

function closeDb() {
  for (const db of dbCache.values()) {
    try { db.close() } catch {}
  }
  dbCache.clear()
}

// ── Multi-workspace session lookup ──

function findSessionWorkspace(workspaces, sessionId) {
  for (const ws of workspaces) {
    // coding-agent workspaces don't have their own sessions DB
    if (ws.type === 'coding-agent') continue
    const db = getDb(ws.path)
    if (!db) continue
    const exists = db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(sessionId)
    if (exists) return ws.path
  }
  return null
}

function listAllSessions(workspaces, opts = {}) {
  const queriedDbs = new Set()
  const seenIds = new Set()
  const allSessions = []
  for (const ws of workspaces) {
    // coding-agent workspaces don't have their own sessions DB
    if (ws.type === 'coding-agent') continue
    const dbPath = path.resolve(ws.path, '.paw', 'sessions.db')
    if (queriedDbs.has(dbPath)) continue
    queriedDbs.add(dbPath)
    const sessions = listSessions(ws.path, opts)
    for (const s of sessions) {
      if (seenIds.has(s.id)) continue
      seenIds.add(s.id)
      s.workspacePath = ws.path
      s.workspaceId = ws.id
      allSessions.push(s)
    }
  }
  allSessions.sort((a, b) => b.updatedAt - a.updatedAt)
  return allSessions
}

function updateSessionStatus(clawDir, sessionId, level, text) {
  const d = getDb(clawDir)
  if (!d) return
  d.prepare('UPDATE sessions SET status_level = ?, status_text = ? WHERE id = ?').run(level || 'idle', text || '', sessionId)
}

function addTokenUsage(clawDir, sessionId, inputTokens, outputTokens) {
  const d = getDb(clawDir)
  if (!d) return
  d.prepare('UPDATE sessions SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ? WHERE id = ?')
    .run(inputTokens || 0, outputTokens || 0, sessionId)
}

function getTokenUsage(clawDir, sessionId) {
  const d = getDb(clawDir)
  if (!d) return { inputTokens: 0, outputTokens: 0 }
  const row = d.prepare('SELECT input_tokens as inputTokens, output_tokens as outputTokens FROM sessions WHERE id = ?').get(sessionId)
  return row || { inputTokens: 0, outputTokens: 0 }
}

function getSessionStatus(clawDir, sessionId) {
  const d = getDb(clawDir)
  if (!d) return null
  return d.prepare('SELECT status_level as level, status_text as text FROM sessions WHERE id = ?').get(sessionId)
}

// ── Session Agents CRUD ──

function createSessionAgent(clawDir, sessionId, { name, role }) {
  const d = getDb(clawDir)
  if (!d) return null
  const id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
  const now = Date.now()
  d.prepare('INSERT INTO session_agents (id, session_id, name, role, created_at) VALUES (?,?,?,?,?)')
    .run(id, sessionId, name, role || '', now)
  return { id, sessionId, name, role: role || '', createdAt: now }
}

function listSessionAgents(clawDir, sessionId) {
  const d = getDb(clawDir)
  if (!d) return []
  return d.prepare('SELECT id, session_id as sessionId, name, role, created_at as createdAt FROM session_agents WHERE session_id = ? ORDER BY created_at').all(sessionId)
}

function getSessionAgent(clawDir, agentId) {
  const d = getDb(clawDir)
  if (!d) return null
  return d.prepare('SELECT id, session_id as sessionId, name, role, created_at as createdAt FROM session_agents WHERE id = ?').get(agentId)
}

function deleteSessionAgent(clawDir, agentId) {
  const d = getDb(clawDir)
  if (!d) return false
  const result = d.prepare('DELETE FROM session_agents WHERE id = ?').run(agentId)
  return result.changes > 0
}

function findSessionAgentByName(clawDir, sessionId, name) {
  const d = getDb(clawDir)
  if (!d) return null
  return d.prepare('SELECT id, session_id as sessionId, name, role, created_at as createdAt FROM session_agents WHERE session_id = ? AND name = ?').get(sessionId, name)
}

function isSessionStale(clawDir, sessionId, resetConfig = {}) {
  const d = getDb(clawDir)
  if (!d) return false
  const session = d.prepare('SELECT updated_at as updatedAt FROM sessions WHERE id = ?').get(sessionId)
  if (!session) return false

  const lastUpdate = session.updatedAt
  const now = Date.now()

  const dailyHour = resetConfig.dailyResetHour ?? 4
  if (dailyHour >= 0) {
    const resetTime = new Date()
    resetTime.setHours(dailyHour, 0, 0, 0)
    if (resetTime.getTime() > now) resetTime.setDate(resetTime.getDate() - 1)
    if (lastUpdate < resetTime.getTime()) return true
  }

  const idleMinutes = resetConfig.idleMinutes
  if (idleMinutes && idleMinutes > 0) {
    if (now - lastUpdate > idleMinutes * 60 * 1000) return true
  }

  return false
}

// ── Session mode ──

function getSessionMode(clawDir, sessionId) {
  const d = getDb(clawDir)
  if (!d) return 'chat'
  const row = d.prepare('SELECT mode FROM sessions WHERE id = ?').get(sessionId)
  return row?.mode || 'chat'
}

function setSessionMode(clawDir, sessionId, mode) {
  const d = getDb(clawDir)
  if (!d) return
  d.prepare('UPDATE sessions SET mode = ? WHERE id = ?').run(mode || 'chat', sessionId)
}

// ── Session participants ──

function getSessionParticipants(clawDir, sessionId) {
  const d = getDb(clawDir)
  if (!d) return []
  const row = d.prepare('SELECT participants FROM sessions WHERE id = ?').get(sessionId)
  const pids = _parseParticipants(row?.participants)
  // Migrate ca: prefixed IDs to workspace IDs on read
  if (pids.some(p => typeof p === 'string' && p.startsWith('ca:'))) {
    return _migrateParticipantIds(d, sessionId, pids)
  }
  return pids
}

function addSessionParticipant(clawDir, sessionId, workspaceId) {
  const participants = getSessionParticipants(clawDir, sessionId)
  if (participants.includes(workspaceId)) return true
  participants.push(workspaceId)
  const d = getDb(clawDir)
  if (!d) return false
  d.prepare('UPDATE sessions SET participants = ? WHERE id = ?').run(JSON.stringify(participants), sessionId)
  return true
}

function removeSessionParticipant(clawDir, sessionId, workspaceId) {
  const participants = getSessionParticipants(clawDir, sessionId).filter(id => id !== workspaceId)
  const d = getDb(clawDir)
  if (!d) return false
  d.prepare('UPDATE sessions SET participants = ? WHERE id = ?').run(JSON.stringify(participants), sessionId)
  return true
}

module.exports = { getDb, listSessions, loadSession, saveSession, appendMessage, deleteMessage, deleteSession, renameSession, getSessionTitle, createSession, closeDb, updateSessionStatus, getSessionStatus, getSessionMode, setSessionMode, createSessionAgent, listSessionAgents, getSessionAgent, deleteSessionAgent, findSessionAgentByName, isSessionStale, addTokenUsage, getTokenUsage, addSessionParticipant, removeSessionParticipant, getSessionParticipants, findSessionWorkspace, listAllSessions, updateMessageMeta, findLastMessage }
