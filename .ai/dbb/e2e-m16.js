// E2E test for M16 Agent Team features
const path = require('path')
const fs = require('fs')

const TEST_DIR = '/tmp/paw-test-claw'
const CONFIG = JSON.parse(fs.readFileSync(path.join(TEST_DIR, '.paw/config.json'), 'utf8'))

// Test 1: Session Store + Tasks
console.log('\n=== Test 1: Task CRUD ===')
const ss = require('../../session-store')
const s = ss.createSession(TEST_DIR, 'E2E Test')
console.log('✅ Session created:', s.id)

const t1 = ss.createTask(TEST_DIR, s.id, { title: 'Design API', createdBy: 'Architect' })
const t2 = ss.createTask(TEST_DIR, s.id, { title: 'Implement', dependsOn: [t1.id], createdBy: 'Dev' })
const t3 = ss.createTask(TEST_DIR, s.id, { title: 'Test', dependsOn: [t2.id], createdBy: 'QA' })
console.log('✅ 3 tasks created with dependencies')

// Verify dependency blocking
const blocked = ss.updateTask(TEST_DIR, t2.id, { status: 'in-progress', assignee: 'Dev' })
console.log(blocked.error ? '✅ T2 correctly blocked' : '❌ T2 should be blocked')

// Complete T1, then claim T2
ss.updateTask(TEST_DIR, t1.id, { status: 'in-progress', assignee: 'Architect' })
ss.updateTask(TEST_DIR, t1.id, { status: 'done', assignee: 'Architect' })
const unblocked = ss.updateTask(TEST_DIR, t2.id, { status: 'in-progress', assignee: 'Dev' })
console.log(!unblocked.error ? '✅ T2 unblocked after T1 done' : '❌ T2 should be unblocked')

const tasks = ss.listTasks(TEST_DIR, s.id)
console.log(`✅ Task list: ${tasks.length} tasks, statuses: ${tasks.map(t=>t.status).join(',')}`)

ss.closeDb()
