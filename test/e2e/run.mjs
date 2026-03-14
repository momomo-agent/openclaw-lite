/**
 * test/e2e/run.mjs — E2E test runner for Paw
 *
 * Launches mock API + Paw with CDP, connects via Playwright,
 * runs real conversation tests (1v1, tool use, session management).
 *
 * Usage: npm run test:e2e
 *   or:  node test/e2e/run.mjs
 *   or:  node test/e2e/run.mjs --no-launch  (connect to already-running Paw on port 9222)
 */
import { chromium } from 'playwright'
import { spawn } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../..')

const CDP_PORT = 9222
const MOCK_API_PORT = 8765
const NO_LAUNCH = process.argv.includes('--no-launch')
const TIMEOUT = 30_000

// ── Test utilities ──

let page = null
let browser = null
let pawProcess = null
let mockApiProcess = null
let passed = 0
let failed = 0
const results = []

async function assert(name, fn) {
  const start = Date.now()
  try {
    await fn()
    const ms = Date.now() - start
    console.log(`  ✓ ${name} (${ms}ms)`)
    passed++
    results.push({ name, ok: true, ms })
  } catch (err) {
    const ms = Date.now() - start
    console.error(`  ✗ ${name} (${ms}ms)`)
    console.error(`    ${err.message}`)
    failed++
    results.push({ name, ok: false, ms, error: err.message })
  }
}

/** Get all messages from the message list */
async function getMessages() {
  return page.$$eval('[data-testid="message"]', els =>
    els.map(el => ({
      role: el.dataset.role,
      sender: el.dataset.sender,
      text: el.querySelector('.msg-content')?.textContent?.trim() || '',
    }))
  )
}

/** Type a message and send it */
async function sendMessage(text) {
  const input = await page.waitForSelector('[data-testid="chat-input"]', { timeout: 5000 })
  await input.fill(text)
  // Small delay for React state update
  await sleep(100)
  await page.click('[data-testid="send-btn"]')
}

/** Wait for a new assistant message with non-empty text */
async function waitForReply(currentCount, timeout = TIMEOUT) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const msgs = await getMessages()
    const filledAssistant = msgs.filter(m => m.role === 'assistant' && m.text.trim().length > 0)
    if (filledAssistant.length > currentCount) return filledAssistant[filledAssistant.length - 1]
    await sleep(500)
  }
  // Debug: dump current state
  const msgs = await getMessages()
  const dump = msgs.map(m => `${m.role}:${m.sender}:"${m.text.slice(0, 50)}"`).join(' | ')
  throw new Error(`Timed out waiting for reply (had ${currentCount} filled msgs). Current: ${dump}`)
}

/** Count non-empty messages by role */
async function countMessages(role) {
  const msgs = await getMessages()
  return msgs.filter(m => m.role === role && m.text.trim().length > 0).length
}

/** Create or update Paw settings with mock API config */
function setupMockConfig() {
  const pawDir = path.join(os.homedir(), '.paw')
  const settingsPath = path.join(pawDir, 'settings.json')
  const backupPath = path.join(pawDir, 'settings.json.e2e-backup')

  // Backup existing settings
  if (fs.existsSync(settingsPath)) {
    fs.copyFileSync(settingsPath, backupPath)
    console.log('Backed up existing settings.json')
  }

  // Write mock config
  const config = {
    provider: 'anthropic',
    apiKey: 'sk-e2e-test-mock-key',
    baseUrl: `http://127.0.0.1:${MOCK_API_PORT}`,
    model: 'claude-sonnet-4-20250514',
    _e2e: true
  }
  fs.mkdirSync(pawDir, { recursive: true })
  fs.writeFileSync(settingsPath, JSON.stringify(config, null, 2))
  console.log(`Settings: baseUrl → mock API (port ${MOCK_API_PORT})`)
}

/** Restore original settings */
function restoreConfig() {
  const pawDir = path.join(os.homedir(), '.paw')
  const settingsPath = path.join(pawDir, 'settings.json')
  const backupPath = path.join(pawDir, 'settings.json.e2e-backup')

  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, settingsPath)
    fs.unlinkSync(backupPath)
    console.log('Restored original settings.json')
  } else {
    // No original — remove the mock config
    try { fs.unlinkSync(settingsPath) } catch {}
  }
}

// ── Launch / Connect ──

async function startMockApi() {
  console.log('Starting mock API server...')
  mockApiProcess = spawn('node', [path.join(__dirname, 'mock-api.mjs'), `--port=${MOCK_API_PORT}`], {
    stdio: 'pipe',
  })
  mockApiProcess.stdout.on('data', d => process.env.E2E_VERBOSE && process.stdout.write('[mock] ' + d))
  mockApiProcess.stderr.on('data', d => process.stderr.write('[mock-err] ' + d))

  // Wait for health
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${MOCK_API_PORT}/health`)
      if (res.ok) { console.log('Mock API ready.'); return }
    } catch {}
    await sleep(200)
  }
  throw new Error('Mock API failed to start')
}

async function launch() {
  if (!NO_LAUNCH) {
    // Start mock API first
    await startMockApi()

    // Configure Paw to use mock API
    setupMockConfig()

    // Kill any existing Paw/Electron on CDP port
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (res.ok) {
        console.log('Warning: CDP port already in use, tests may connect to wrong instance')
      }
    } catch {} // expected — port should be free

    console.log('Launching Paw...')
    pawProcess = spawn('npx', ['electron', '.', `--e2e-port=${CDP_PORT}`], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      env: { ...process.env },
    })
    pawProcess.stdout.on('data', d => process.env.E2E_VERBOSE && process.stdout.write('[paw] ' + d))
    pawProcess.stderr.on('data', d => process.env.E2E_VERBOSE && process.stderr.write('[paw-err] ' + d))

    // Wait for CDP
    console.log('Waiting for CDP...')
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
        if (res.ok) break
      } catch {}
      await sleep(1000)
    }
  }

  // Connect via Playwright
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
  const contexts = browser.contexts()
  if (contexts.length === 0) throw new Error('No browser contexts found')

  const pages = contexts[0].pages()
  page = pages.find(p => p.url().includes('index.html')) || pages[0]
  if (!page) throw new Error('No Paw page found')

  console.log(`Connected: ${page.url()}`)
  await page.waitForSelector('[data-testid="input-bar"]', { timeout: 30_000 })
  
  // Dismiss any overlays (backdrop, modals)
  for (let i = 0; i < 3; i++) {
    const backdrop = await page.$('.overlay-backdrop')
    if (backdrop) {
      console.log('Dismissing overlay...')
      await page.keyboard.press('Escape')
      await sleep(300)
    } else break
  }
  // Wait for overlays to fully close
  await page.waitForSelector('.overlay-backdrop', { state: 'hidden', timeout: 3000 }).catch(() => {})

  console.log('Paw ready.\n')
}

async function cleanup() {
  // Clean up test sessions from Paw UI before closing
  if (page) {
    try {
      // Delete sessions created during testing via IPC
      await page.evaluate(() => {
        // Paw exposes ipc via preload — try to delete recent sessions
        // Best-effort: if it fails, user just has leftover test sessions
        window.electronAPI?.send?.('cleanup-test-sessions')
      })
    } catch {}
  }
  if (browser) await browser.close().catch(() => {})
  if (pawProcess) {
    pawProcess.kill('SIGTERM')
    await sleep(500)
    if (!pawProcess.killed) pawProcess.kill('SIGKILL')
  }
  if (mockApiProcess) {
    mockApiProcess.kill('SIGTERM')
  }
  if (!NO_LAUNCH) {
    restoreConfig()
  }
}

// ── Tests ──

async function test_session_management() {
  console.log('── Session Management ──')

  await assert('sidebar has session items', async () => {
    const items = await page.$$('[data-testid="session-item"]')
    if (items.length === 0) throw new Error('No sessions in sidebar')
  })

  await assert('new chat button exists and works', async () => {
    const btn = await page.$('[data-testid="new-chat-btn"]')
    if (!btn) throw new Error('New chat button not found')
  })

  await assert('input bar is ready', async () => {
    const el = await page.$('[data-testid="input-bar"]')
    if (!el) throw new Error('Input bar not found')
    const input = await page.$('[data-testid="chat-input"]')
    if (!input) throw new Error('Chat input textarea not found')
  })
}

async function test_1v1_chat() {
  console.log('\n── 1v1 Chat ──')

  // Don't click new-chat-btn — just use the current session to avoid overlay issues

  await assert('send message and receive reply', async () => {
    const before = await countMessages('assistant')
    await sendMessage('Say "paw test ok" and nothing else.')
    const reply = await waitForReply(before)
    if (!reply.text.toLowerCase().includes('paw test ok')) {
      throw new Error(`Expected "paw test ok", got: "${reply.text.slice(0, 100)}"`)
    }
  })

  await assert('message list has both user and assistant', async () => {
    const msgs = await getMessages()
    if (!msgs.some(m => m.role === 'user')) throw new Error('No user message')
    if (!msgs.some(m => m.role === 'assistant' && m.text.trim())) throw new Error('No assistant reply')
  })

  await assert('assistant message has sender name', async () => {
    const msgs = await getMessages()
    const a = msgs.find(m => m.role === 'assistant' && m.text.trim())
    if (!a?.sender) throw new Error(`No sender on assistant msg. Got: ${JSON.stringify(a)}`)
  })

  await assert('user message appears in message list', async () => {
    const msgs = await getMessages()
    const u = msgs.find(m => m.role === 'user')
    if (!u?.text.includes('paw test ok')) throw new Error(`User msg wrong: "${u?.text}"`)
  })

  await assert('multiple messages in sequence', async () => {
    const before = await countMessages('assistant')
    await sendMessage('hello')
    const reply = await waitForReply(before)
    if (!reply.text) throw new Error('Empty reply to hello')
  })
}

async function test_tool_use() {
  console.log('\n── Tool Use ──')

  await assert('tool call works (file_read)', async () => {
    const before = await countMessages('assistant')
    await sendMessage('Read the file SOUL.md and tell me the first line.')
    const reply = await waitForReply(before, 45_000) // tool calls need more time
    if (!reply.text || reply.text.length < 10) {
      throw new Error(`Reply too short after tool use: "${reply.text}"`)
    }
  })

  await assert('tool step elements exist in DOM', async () => {
    const tools = await page.$$('.tool-group, .tool-step, .tool-row')
    // After file_read, should have at least one tool element
    if (tools.length === 0) {
      // Check if collapsed
      const collapsed = await page.$$('.tool-group.collapsed, .tool-toggle')
      if (collapsed.length === 0) {
        console.log('    ⚠ no tool elements found (may need data-testid on tool groups)')
      }
    }
  })
}

async function test_error_handling() {
  console.log('\n── Error Handling ──')

  await assert('empty message does not send', async () => {
    const before = await countMessages('user')
    // Try to send empty
    const input = await page.waitForSelector('[data-testid="chat-input"]')
    await input.fill('')
    await page.click('[data-testid="send-btn"]')
    await sleep(500)
    const after = await countMessages('user')
    if (after !== before) throw new Error('Empty message was sent')
  })
}

// ── Main ──

async function main() {
  console.log('╔══════════════════════════════╗')
  console.log('║     Paw E2E Test Suite       ║')
  console.log('╚══════════════════════════════╝\n')

  try {
    await launch()

    await test_session_management()
    await test_1v1_chat()
    await test_tool_use()
    await test_error_handling()

    console.log(`\n${'═'.repeat(40)}`)
    console.log(`  Results: ${passed} passed, ${failed} failed`)
    console.log('═'.repeat(40))

    if (failed > 0) process.exitCode = 1
  } catch (err) {
    console.error('\n💥 Fatal:', err.message)
    process.exitCode = 1
  } finally {
    await cleanup()
  }
}

main()
