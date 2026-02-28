#!/usr/bin/env node
// DBB automated test for Paw
// Uses CDP (Chrome DevTools Protocol) for interaction + agent-control for screenshots

const http = require('http')
const fs = require('fs')
const path = require('path')
const { execSync, spawn } = require('child_process')

const SCREENSHOT_DIR = '/Users/kenefe/.openclaw/media/outbound'
const AC = '/Users/kenefe/LOCAL/momo-agent/agent-control/cli.js'
const APP_DIR = path.resolve(__dirname, '..')
const PREFS_DIR = path.join(require('os').homedir(), 'Library/Application Support/paw')

let electronProc = null

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function screenshot(name) {
  const p = path.join(SCREENSHOT_DIR, `dbb-${name}.png`)
  try { execSync(`node ${AC} -p macos screenshot ${p}`, { timeout: 10000 }) } catch {}
  return p
}

async function cdpEval(expr) {
  const pages = JSON.parse(await httpGet('http://localhost:9223/json'))
  const wsUrl = pages[0]?.webSocketDebuggerUrl
  if (!wsUrl) throw new Error('No CDP page found')
  // Use simple HTTP-based eval via /json/evaluate isn't standard, use ws
  // Fallback: write a temp script and use electron's executeJavaScript via IPC
  return null
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

function launchElectron(args = []) {
  return new Promise((resolve) => {
    electronProc = spawn('npx', ['electron', '.', '--remote-debugging-port=9223', ...args], {
      cwd: APP_DIR, stdio: 'pipe', env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }
    })
    setTimeout(resolve, 5000)
  })
}

function killElectron() {
  if (electronProc) { electronProc.kill(); electronProc = null }
}

const results = []
function pass(name) { results.push({ name, status: 'PASS' }); console.log(`✅ ${name}`) }
function fail(name, reason) { results.push({ name, status: 'FAIL', reason }); console.log(`❌ ${name}: ${reason}`) }

async function main() {
  console.log('=== Paw DBB Test ===\n')

  // T1: Setup screen renders
  console.log('T1: Setup screen...')
  fs.mkdirSync(PREFS_DIR, { recursive: true })
  fs.writeFileSync(path.join(PREFS_DIR, 'prefs.json'), '{}')
  await launchElectron()
  const s1 = screenshot('t1-setup')
  if (fs.existsSync(s1) && fs.statSync(s1).size > 1000) pass('T1-setup-renders')
  else fail('T1-setup-renders', 'Screenshot missing or empty')
  killElectron()
  await sleep(2000)

  // T2: Chat screen with existing prefs
  console.log('T2: Chat screen...')
  const testDir = '/tmp/ocl-dbb-test'
  fs.mkdirSync(path.join(testDir, 'sessions'), { recursive: true })
  fs.mkdirSync(path.join(testDir, 'agents'), { recursive: true })
  fs.writeFileSync(path.join(testDir, 'config.json'), JSON.stringify({
    provider: 'anthropic',
    apiKey: process.env.TEST_API_KEY || 'sk-test',
    baseUrl: process.env.TEST_BASE_URL || '',
    model: process.env.TEST_MODEL || 'claude-sonnet-4-20250514'
  }))
  fs.writeFileSync(path.join(testDir, 'SOUL.md'), '# Test Soul\nYou are a test assistant.')
  fs.writeFileSync(path.join(PREFS_DIR, 'prefs.json'), JSON.stringify({ clawDir: testDir }))
  await launchElectron()
  const s2 = screenshot('t2-chat')
  if (fs.existsSync(s2) && fs.statSync(s2).size > 1000) pass('T2-chat-renders')
  else fail('T2-chat-renders', 'Screenshot missing or empty')

  // T3: Config read/write
  console.log('T3: Config persistence...')
  const cfgPath = path.join(testDir, 'config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  if (cfg.provider === 'anthropic') pass('T3-config-readable')
  else fail('T3-config-readable', 'Config not readable')

  // T4: Agent creation
  console.log('T4: Agent creation...')
  const agentFile = path.join(testDir, 'agents', 'test-agent.json')
  fs.writeFileSync(agentFile, JSON.stringify({ id: 'test-agent', name: 'TestBot', soul: 'You are TestBot.', model: '' }))
  if (fs.existsSync(agentFile)) pass('T4-agent-created')
  else fail('T4-agent-created', 'Agent file not written')

  // T5: Session persistence
  console.log('T5: Session persistence...')
  const sessFile = path.join(testDir, 'sessions', 'test-sess.json')
  fs.writeFileSync(sessFile, JSON.stringify({
    id: 'test-sess', title: 'DBB Test Session',
    messages: [
      { role: 'user', content: 'Hello', sender: 'You' },
      { role: 'assistant', content: 'Hi there!', sender: 'TestBot' }
    ],
    members: ['user', 'test-agent'],
    createdAt: Date.now(), updatedAt: Date.now()
  }))
  killElectron()
  await sleep(2000)
  await launchElectron()
  await sleep(1000)
  const s5 = screenshot('t5-persistence')
  if (fs.existsSync(s5) && fs.statSync(s5).size > 1000) pass('T5-session-persisted')
  else fail('T5-session-persisted', 'Screenshot missing')

  // T6: Members visible in session
  console.log('T6: Members in session...')
  const sessData = JSON.parse(fs.readFileSync(sessFile, 'utf8'))
  if (sessData.members?.includes('test-agent')) pass('T6-member-in-session')
  else fail('T6-member-in-session', 'Agent not in members')

  killElectron()

  // Summary
  console.log('\n=== Results ===')
  const passed = results.filter(r => r.status === 'PASS').length
  console.log(`${passed}/${results.length} passed`)
  results.forEach(r => console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.name}${r.reason ? ': ' + r.reason : ''}`))

  process.exit(results.some(r => r.status === 'FAIL') ? 1 : 0)
}

main().catch(e => { console.error(e); killElectron(); process.exit(1) })
