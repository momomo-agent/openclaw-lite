#!/usr/bin/env node
/**
 * Paw Full-Feature DBB — Playwright Electron API
 * Covers: setup, config, session, agent, chat, tool call, scrollbar, overflow, markdown, file link
 * Usage: node .ai/dbb/dbb-full.js
 */
const { _electron: electron } = require('playwright')
const fs = require('fs')
const path = require('path')

const SCREENSHOTS = path.join(__dirname, 'latest')
fs.mkdirSync(SCREENSHOTS, { recursive: true })

const PAW_ROOT = path.resolve(__dirname, '../..')
const ELECTRON_BIN = path.join(PAW_ROOT, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
const MAIN_JS = path.join(PAW_ROOT, 'main.js')
const TEST_WORKSPACE = '/tmp/paw-dbb-workspace'

const results = []
function record(id, name, status, notes) {
  results.push({ id, name, status, notes })
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️'
  console.log(`${icon} ${id}: ${name} — ${notes}`)
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Prepare test workspace with real API config
function prepareWorkspace() {
  fs.mkdirSync(TEST_WORKSPACE, { recursive: true })
  for (const d of ['sessions', 'memory', 'skills', 'agents']) {
    fs.mkdirSync(path.join(TEST_WORKSPACE, d), { recursive: true })
  }
  fs.writeFileSync(path.join(TEST_WORKSPACE, 'config.json'), JSON.stringify({
    provider: 'anthropic',
    apiKey: process.env.PAW_TEST_KEY || '',
    model: process.env.PAW_TEST_MODEL || 'claude-sonnet-4-20250514',
    baseUrl: process.env.PAW_TEST_BASE || 'https://api.anthropic.com',
    tavilyKey: process.env.PAW_TEST_TAVILY || ''
  }, null, 2))
  fs.writeFileSync(path.join(TEST_WORKSPACE, 'SOUL.md'),
    'You are a helpful assistant. Reply concisely in Chinese. Keep answers under 50 words.')
}

async function main() {
  console.log('=== Paw Full-Feature DBB ===\n')
  prepareWorkspace()

  // Kill existing Paw
  try { require('child_process').execSync('pkill -f "Electron.*paw"', { stdio: 'ignore' }) } catch {}
  await sleep(1000)

  // Write prefs to point to test workspace
  const { execSync } = require('child_process')
  const userData = execSync('node -e "const e=require(\'electron\');console.log(e.app?.getPath?.(\'userData\')??\'\')"', { cwd: PAW_ROOT }).toString().trim()
  // Fallback: write to known location
  const prefsDir = path.join(require('os').homedir(), 'Library/Application Support/paw')
  fs.mkdirSync(prefsDir, { recursive: true })
  fs.writeFileSync(path.join(prefsDir, 'prefs.json'), JSON.stringify({ clawDir: TEST_WORKSPACE }))

  console.log('Launching Paw via Playwright Electron...')
  const app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: [MAIN_JS],
    timeout: 15000
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await sleep(2000)
  console.log('Window ready.\n')

  // Helper: screenshot
  async function shot(name) {
    await win.screenshot({ path: path.join(SCREENSHOTS, name) })
    console.log(`  📸 ${name}`)
  }

  // Helper: send a chat message and wait for response
  async function sendChat(text, waitMs = 20000) {
    const input = await win.$('#chatInput')
    if (!input) throw new Error('chatInput not found')
    await input.fill(text)
    await input.press('Enter')
    await sleep(waitMs)
  }

  // ═══ TC01: Chat screen renders ═══
  try {
    const bodyText = await win.evaluate(() => document.body?.innerText?.slice(0, 200))
    const isChat = bodyText.includes('New Chat') || await win.$('#chatInput') !== null
    const isSetup = bodyText.includes('Create New')
    await shot('tc01-launch.png')
    record('TC01', 'App launches to chat', isChat ? 'PASS' : 'FAIL',
      isChat ? 'Chat screen visible' : isSetup ? 'Stuck on setup' : `Body: ${bodyText.slice(0, 60)}`)
    if (isSetup) {
      console.log('⚠️ Setup screen — cannot continue interactive tests')
      await writeReport()
      await app.close()
      return
    }
  } catch (e) { record('TC01', 'App launches', 'FAIL', e.message) }

  // ═══ TC02: Pure text chat ═══
  try {
    await sendChat('你好，简单回复一句话就行', 15000)
    const cards = await win.$$eval('.msg-card.assistant', els => els.length)
    const lastText = await win.$eval('.msg-card.assistant:last-of-type .md-content',
      el => el?.textContent?.trim() || '')
    await shot('tc02-text-chat.png')
    record('TC02', 'Pure text chat', cards > 0 && lastText.length > 2 ? 'PASS' : 'FAIL',
      `Cards: ${cards}, text: "${lastText.slice(0, 60)}"`)
  } catch (e) { record('TC02', 'Pure text chat', 'FAIL', e.message) }
