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
      updated_at INTEGER NOT NULL
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
}

function listSessions(clawDir) {
  const d = getDb(clawDir)
  if (!d) return []
  return d.prepare('SELECT id, title, created_at as createdAt, updated_at as updatedAt FROM sessions ORDER BY updated_at DESC').all()
}

function loadSession(clawDir, id) {
  const d = getDb(clawDir)
  if (!d) return null
  const session = d.prepare('SELECT id, title, created_at as createdAt, updated_at as updatedAt FROM sessions WHERE id = ?').get(id)
  if (!session) return null
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
  // Upsert session row
  d.prepare('INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, updated_at=excluded.updated_at')
    .run(session.id, session.title || 'New Chat', session.createdAt || now, now)
  // Replace all messages (simple approach — fine for desktop app scale)
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

function createSession(clawDir, title) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const now = Date.now()
  const session = { id, title: title || 'New Chat', messages: [], createdAt: now, updatedAt: now }
  saveSession(clawDir, session)
  return session
}

// Migrate JSON sessions to SQLite
function migrateFromJson(clawDir) {
  const jsonDir = path.join(clawDir, 'sessions')
  if (!fs.existsSync(jsonDir)) return 0
  const files = fs.readdirSync(jsonDir).filter(f => f.endsWith('.json'))
  let count = 0
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(jsonDir, f), 'utf8'))
      if (!data.id) continue
      // Check if already migrated
      const d = getDb(clawDir)
      const existing = d.prepare('SELECT id FROM sessions WHERE id = ?').get(data.id)
      if (existing) continue
      saveSession(clawDir, data)
      count++
    } catch {}
  }
  if (count > 0) console.log(`[session-store] Migrated ${count} JSON sessions to SQLite`)
  return count
}

function closeDb() {
  if (db) { try { db.close() } catch {} db = null; dbPath = null }
}

module.exports = { getDb, listSessions, loadSession, saveSession, deleteSession, createSession, migrateFromJson, closeDb }
