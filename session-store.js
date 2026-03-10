// Session Store — SQLite backend (aligned with OpenClaw)
const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')

let db = null
let dbPath = null

function getDb(clawDir) {
  if (!clawDir) return null
  const target = path.join(clawDir, '.paw', 'sessions.db')
  if (db && dbPath === target) return db
  fs.mkdirSync(path.dirname(target), { recursive: true })
  db = new Database(target)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  dbPath = target
  ensureSchema(db)
  return db
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
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
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      assignee TEXT,
      depends_on TEXT,
      created_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id)`)
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
}

function _parseParticipants(raw) {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

function listSessions(clawDir, { workspaceId } = {}) {
  const d = getDb(clawDir)
  if (!d) return []
  const sessions = d.prepare(`
    SELECT s.id, s.title, s.created_at as createdAt, s.updated_at as updatedAt,
           s.status_level as statusLevel, s.status_text as statusText, s.participants,
           (SELECT substr(m.content, 1, 60) FROM messages m WHERE m.session_id = s.id ORDER BY m.id DESC LIMIT 1) as lastMessage
    FROM sessions s ORDER BY s.updated_at DESC
  `).all()
  for (const s of sessions) {
    s.participants = _parseParticipants(s.participants)
  }
  if (workspaceId) {
    return sessions.filter(s => s.participants.includes(workspaceId))
  }
  return sessions
}

function loadSession(clawDir, id) {
  const d = getDb(clawDir)
  if (!d) return null
  const session = d.prepare('SELECT id, title, created_at as createdAt, updated_at as updatedAt, participants FROM sessions WHERE id = ?').get(id)
  if (!session) return null
  session.participants = _parseParticipants(session.participants)
  const rows = d.prepare('SELECT role, content, timestamp, metadata FROM messages WHERE session_id = ? ORDER BY id').all(id)
  session.messages = rows.map(r => {
    const msg = { role: r.role, content: r.content, timestamp: r.timestamp }
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
  d.prepare('INSERT INTO sessions (id, title, created_at, updated_at, participants) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, updated_at=excluded.updated_at, participants=excluded.participants')
    .run(session.id, session.title || 'New Chat', session.createdAt || now, now, participants)
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

function deleteSession(clawDir, id) {
  const d = getDb(clawDir)
  if (!d) return
  d.prepare('DELETE FROM sessions WHERE id = ?').run(id)
}

function createSession(clawDir, title, { participants } = {}) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const now = Date.now()
  const wsIds = participants || []
  const session = { id, title: title || 'New Chat', messages: [], createdAt: now, updatedAt: now, participants: wsIds }
  saveSession(clawDir, session)
  return session
}

// ── Tasks CRUD ──

function createTask(clawDir, sessionId, { title, dependsOn, createdBy, assignee }) {
  const d = getDb(clawDir)
  if (!d) return null
  const id = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
  const now = Date.now()
  const deps = Array.isArray(dependsOn) && dependsOn.length ? JSON.stringify(dependsOn) : null
  d.prepare('INSERT INTO tasks (id, session_id, title, status, assignee, depends_on, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, sessionId, title, 'pending', assignee || null, deps, createdBy || null, now, now)
  return { id, sessionId, title, status: 'pending', assignee: assignee || null, dependsOn: dependsOn || [], createdBy, createdAt: now }
}

function updateTask(clawDir, taskId, { status, assignee }) {
  const d = getDb(clawDir)
  if (!d) return null
  const task = d.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId)
  if (!task) return { error: 'Task not found' }

  const deps = task.depends_on ? JSON.parse(task.depends_on) : []

  if (status === 'in-progress' && deps.length) {
    const placeholders = deps.map(() => '?').join(',')
    const blocked = d.prepare(`SELECT id FROM tasks WHERE id IN (${placeholders}) AND status != 'done'`).all(...deps)
    if (blocked.length) return { error: `Blocked by: ${blocked.map(b => b.id).join(', ')}` }
  }

  const order = { pending: 0, 'in-progress': 1, done: 2 }
  if (order[status] <= order[task.status]) return { error: `Cannot move from ${task.status} to ${status}` }

  const now = Date.now()
  const sets = ['status = ?', 'updated_at = ?']
  const vals = [status, now]
  if (assignee !== undefined) { sets.push('assignee = ?'); vals.push(assignee) }
  vals.push(taskId)
  d.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals)

  return { id: taskId, status, assignee: assignee || task.assignee }
}

function listTasks(clawDir, sessionId) {
  const d = getDb(clawDir)
  if (!d) return []
  const rows = d.prepare('SELECT * FROM tasks WHERE session_id = ? ORDER BY created_at').all(sessionId)
  return rows.map(r => ({
    id: r.id, title: r.title, status: r.status,
    assignee: r.assignee, dependsOn: r.depends_on ? JSON.parse(r.depends_on) : [],
    createdBy: r.created_by, createdAt: r.created_at
  }))
}

function closeDb() {
  if (db) { try { db.close() } catch {} db = null; dbPath = null }
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

// ── Session participants ──

function getSessionParticipants(clawDir, sessionId) {
  const d = getDb(clawDir)
  if (!d) return []
  const row = d.prepare('SELECT participants FROM sessions WHERE id = ?').get(sessionId)
  return _parseParticipants(row?.participants)
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

module.exports = { getDb, listSessions, loadSession, saveSession, deleteSession, createSession, closeDb, createTask, updateTask, listTasks, updateSessionStatus, getSessionStatus, createSessionAgent, listSessionAgents, getSessionAgent, deleteSessionAgent, findSessionAgentByName, isSessionStale, addTokenUsage, getTokenUsage, addSessionParticipant, removeSessionParticipant, getSessionParticipants }
