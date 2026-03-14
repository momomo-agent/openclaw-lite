/**
 * test/e2e/screenshot-errors.mjs — Generate error state screenshots
 *
 * Launches Paw with different error configs, screenshots each state.
 * Usage: node test/e2e/screenshot-errors.mjs
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
const MOCK_PORT = 8765
const SCREENSHOT_DIR = path.join(PROJECT_ROOT, 'test', 'e2e', 'screenshots')

let page, browser, pawProcess, mockProcess

function setupConfig(config) {
  const settingsPath = path.join(os.homedir(), '.paw', 'settings.json')
  fs.writeFileSync(settingsPath, JSON.stringify(config, null, 2))
}

function restoreConfig() {
  const settingsPath = path.join(os.homedir(), '.paw', 'settings.json')
  const backup = settingsPath + '.screenshot-backup'
  if (fs.existsSync(backup)) {
    fs.copyFileSync(backup, settingsPath)
    fs.unlinkSync(backup)
  } else {
    try { fs.unlinkSync(settingsPath) } catch {}
  }
}

async function startMock(errorMode) {
  if (mockProcess) mockProcess.kill()
  mockProcess = spawn('node', [path.join(__dirname, 'mock-api.mjs'), `--port=${MOCK_PORT}`, `--error-mode=${errorMode}`], { stdio: 'pipe' })
  for (let i = 0; i < 20; i++) {
    try { const r = await fetch(`http://127.0.0.1:${MOCK_PORT}/health`); if (r.ok) return } catch {}
    await sleep(200)
  }
}

async function startPaw() {
  if (pawProcess) { pawProcess.kill(); await sleep(1000) }

  // Clean session data for fresh start
  const sessionsDb = path.join(os.homedir(), 'Documents', '.paw', 'sessions.db')
  if (fs.existsSync(sessionsDb)) {
    try { fs.unlinkSync(sessionsDb) } catch {}
  }

  pawProcess = spawn('npx', ['electron', '.', `--e2e-port=${CDP_PORT}`], { cwd: PROJECT_ROOT, stdio: 'pipe' })
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) break } catch {}
    await sleep(1000)
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
  const pages = browser.contexts()[0].pages()
  page = pages.find(p => p.url().includes('index.html')) || pages[0]
  await page.waitForSelector('[data-testid="input-bar"]', { timeout: 30_000 })
  // Dismiss overlays
  await page.keyboard.press('Escape')
  await sleep(500)
}

async function sendAndWait(text, waitMs = 5000) {
  const input = await page.waitForSelector('[data-testid="chat-input"]', { timeout: 5000 })
  await input.fill(text)
  await sleep(100)
  await page.click('[data-testid="send-btn"]')
  await sleep(waitMs)
}

async function screenshot(name) {
  const p = path.join(SCREENSHOT_DIR, `${name}.png`)
  await page.screenshot({ path: p, fullPage: false })
  console.log(`  📸 ${name}.png`)
  return p
}

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  
  // Backup existing settings
  const settingsPath = path.join(os.homedir(), '.paw', 'settings.json')
  if (fs.existsSync(settingsPath)) {
    fs.copyFileSync(settingsPath, settingsPath + '.screenshot-backup')
  }

  try {
    // ── 1. No API key ──
    console.log('1. No API key error')
    setupConfig({ provider: 'anthropic', model: 'claude-sonnet-4-20250514' })
    await startPaw()
    await sendAndWait('Hello, can you help me?', 3000)
    await screenshot('error-no-api-key')
    await browser.close().catch(() => {})
    pawProcess.kill(); await sleep(1000)

    // ── 2. Network error (mock server down) ──
    console.log('2. Network error')
    setupConfig({ provider: 'anthropic', apiKey: 'sk-test', baseUrl: 'http://127.0.0.1:19999', model: 'claude-sonnet-4-20250514' })
    await startPaw()
    await sendAndWait('Hello?', 5000)
    await screenshot('error-network')
    await browser.close().catch(() => {})
    pawProcess.kill(); await sleep(1000)

    // ── 3. Normal success (for comparison) ──
    console.log('3. Normal success')
    await startMock('normal')
    setupConfig({ provider: 'anthropic', apiKey: 'sk-test', baseUrl: `http://127.0.0.1:${MOCK_PORT}`, model: 'claude-sonnet-4-20250514' })
    await startPaw()
    await sendAndWait('Say hello!', 3000)
    await screenshot('success-normal')
    
    // ── 4. Send another then get error mid-stream ──
    console.log('4. Mid-stream error (rate limit)')
    if (mockProcess) mockProcess.kill()
    await startMock('rate-limit')
    await sendAndWait('Tell me a story', 5000)
    await screenshot('error-rate-limit')

    await browser.close().catch(() => {})
    pawProcess.kill()

    console.log('\nAll screenshots saved to test/e2e/screenshots/')
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (pawProcess) pawProcess.kill()
    if (mockProcess) mockProcess.kill()
    restoreConfig()
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
