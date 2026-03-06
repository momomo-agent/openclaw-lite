#!/usr/bin/env node
/**
 * M19 Unit Test — session-store lightweight agent CRUD
 * No Electron, no CDP. Pure data layer verification.
 * Usage: node .ai/dbb/m19-test.js
 */
const fs = require('fs')
const path = require('path')

const PAW_ROOT = path.resolve(__dirname, '../..')
const TEST_WORKSPACE = '/tmp/paw-m19-unit'

const results = []
function record(id, name, status, notes) {
  results.push({ id, name, status, notes })
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️'
  console.log(`${icon} ${id}: ${name} — ${notes}`)
}

// Prepare clean workspace
fs.rmSync(TEST_WORKSPACE, { recursive: true, force: true })
fs.mkdirSync(path.join(TEST_WORKSPACE, '.paw'), { recursive: true })

const sessionStore = require(path.join(PAW_ROOT, 'session-store'))

console.log('=== M19 Unit Test: Session Agent CRUD ===\n')

// TC01: session_agents table created
try {
  const Database = require('better-sqlite3')
  const db = sessionStore.getDb(TEST_WORKSPACE)
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_agents'").all()
  record('TC01', 'session_agents table exists', tables.length === 1 ? 'PASS' : 'FAIL',
    `Tables: ${JSON.stringify(tables.map(t => t.name))}`)
} catch (e) { record('TC01', 'Table creation', 'FAIL', e.message) }

// TC02: Create session first
let sessionId
try {
  const session = sessionStore.createSession(TEST_WORKSPACE, 'Test Session')
  sessionId = session.id
  record('TC02', 'Create session', session.id ? 'PASS' : 'FAIL', `id: ${session.id}`)
} catch (e) { record('TC02', 'Create session', 'FAIL', e.message) }

// TC03: Create lightweight agent
let agent1
try {
  agent1 = sessionStore.createSessionAgent(TEST_WORKSPACE, sessionId, { name: 'Designer', role: 'UI/UX expert' })
  const ok = agent1 && agent1.id.startsWith('a') && agent1.name === 'Designer' && agent1.role === 'UI/UX expert'
  record('TC03', 'Create session agent', ok ? 'PASS' : 'FAIL',
    `id: ${agent1?.id}, name: ${agent1?.name}, role: ${agent1?.role}`)
} catch (e) { record('TC03', 'Create agent', 'FAIL', e.message) }

// TC04: Create second agent
let agent2
try {
  agent2 = sessionStore.createSessionAgent(TEST_WORKSPACE, sessionId, { name: 'Reviewer', role: 'Code review' })
  record('TC04', 'Create second agent', agent2?.name === 'Reviewer' ? 'PASS' : 'FAIL',
    `id: ${agent2?.id}, name: ${agent2?.name}`)
} catch (e) { record('TC04', 'Create second agent', 'FAIL', e.message) }

// TC05: List session agents
try {
  const agents = sessionStore.listSessionAgents(TEST_WORKSPACE, sessionId)
  const names = agents.map(a => a.name)
  record('TC05', 'List agents', names.includes('Designer') && names.includes('Reviewer') ? 'PASS' : 'FAIL',
    `Agents: ${JSON.stringify(names)}`)
} catch (e) { record('TC05', 'List agents', 'FAIL', e.message) }

// TC06: Get single agent
try {
  const a = sessionStore.getSessionAgent(TEST_WORKSPACE, agent1.id)
  record('TC06', 'Get agent by ID', a?.name === 'Designer' ? 'PASS' : 'FAIL',
    `Got: ${a?.name}`)
} catch (e) { record('TC06', 'Get agent', 'FAIL', e.message) }

// TC07: Find by name
try {
  const a = sessionStore.findSessionAgentByName(TEST_WORKSPACE, sessionId, 'Reviewer')
  record('TC07', 'Find by name', a?.id === agent2.id ? 'PASS' : 'FAIL',
    `Found: ${a?.name} (${a?.id})`)
} catch (e) { record('TC07', 'Find by name', 'FAIL', e.message) }

// TC08: Find non-existent name returns null
try {
  const a = sessionStore.findSessionAgentByName(TEST_WORKSPACE, sessionId, 'Ghost')
  record('TC08', 'Find non-existent', a === undefined || a === null ? 'PASS' : 'FAIL',
    `Result: ${JSON.stringify(a)}`)
} catch (e) { record('TC08', 'Find non-existent', 'FAIL', e.message) }

// TC09: Delete agent
try {
  const ok = sessionStore.deleteSessionAgent(TEST_WORKSPACE, agent1.id)
  const remaining = sessionStore.listSessionAgents(TEST_WORKSPACE, sessionId)
  record('TC09', 'Delete agent', ok && remaining.length === 1 && remaining[0].name === 'Reviewer' ? 'PASS' : 'FAIL',
    `Deleted: ${ok}, remaining: ${JSON.stringify(remaining.map(a => a.name))}`)
} catch (e) { record('TC09', 'Delete agent', 'FAIL', e.message) }

// TC10: Cascade delete — deleting session removes agents
try {
  // Create another session with an agent
  const s2 = sessionStore.createSession(TEST_WORKSPACE, 'Session 2')
  sessionStore.createSessionAgent(TEST_WORKSPACE, s2.id, { name: 'TempBot', role: 'Temp' })
  const before = sessionStore.listSessionAgents(TEST_WORKSPACE, s2.id)
  sessionStore.deleteSession(TEST_WORKSPACE, s2.id)
  // After deleting session, agents should be gone via CASCADE
  const Database = require('better-sqlite3')
  const dbPath = path.join(TEST_WORKSPACE, '.paw', 'sessions.db')
  const db = new Database(dbPath, { readonly: true })
  const orphans = db.prepare("SELECT * FROM session_agents WHERE session_id = ?").all(s2.id)
  db.close()
  record('TC10', 'Cascade delete', before.length === 1 && orphans.length === 0 ? 'PASS' : 'FAIL',
    `Before: ${before.length} agents, after session delete: ${orphans.length} orphans`)
} catch (e) { record('TC10', 'Cascade delete', 'FAIL', e.message) }

// TC11: Agents isolated by session
try {
  const s3 = sessionStore.createSession(TEST_WORKSPACE, 'Session 3')
  sessionStore.createSessionAgent(TEST_WORKSPACE, s3.id, { name: 'OnlyInS3', role: 'test' })
  const inS3 = sessionStore.listSessionAgents(TEST_WORKSPACE, s3.id)
  const inS1 = sessionStore.listSessionAgents(TEST_WORKSPACE, sessionId)
  record('TC11', 'Session isolation',
    inS3.some(a => a.name === 'OnlyInS3') && !inS1.some(a => a.name === 'OnlyInS3') ? 'PASS' : 'FAIL',
    `S3: ${JSON.stringify(inS3.map(a => a.name))}, S1: ${JSON.stringify(inS1.map(a => a.name))}`)
} catch (e) { record('TC11', 'Session isolation', 'FAIL', e.message) }

// Cleanup
sessionStore.closeDb()

// Summary
console.log('\n=== Results ===')
const passed = results.filter(r => r.status === 'PASS').length
const failed = results.filter(r => r.status === 'FAIL').length
console.log(`${passed}/${results.length} passed, ${failed} failed\n`)
results.forEach(r => {
  const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️'
  console.log(`  ${icon} ${r.id}: ${r.name} — ${r.notes}`)
})

process.exit(failed > 0 ? 1 : 0)
