// core/heartbeat.js — Heartbeat system (OpenClaw-aligned)
// Features: HEARTBEAT.md checklist, HEARTBEAT_OK contract, activeHours,
// lightContext, memory flush before compaction
const state = require('./state')
const path = require('path')
const fs = require('fs')

const HEARTBEAT_JOB_ID = '__heartbeat__'

/**
 * Parse time string "HH:MM" to minutes since midnight
 */
function parseTime(str) {
  const [h, m] = str.split(':').map(Number)
  return h * 60 + (m || 0)
}

/**
 * Check if current time is within active hours
 */
function isWithinActiveHours(activeHours) {
  if (!activeHours) return true
  const now = new Date()
  const mins = now.getHours() * 60 + now.getMinutes()
  const start = parseTime(activeHours.start || '00:00')
  const end = parseTime(activeHours.end || '24:00')
  if (start === end) return false // zero-width = always skip
  if (start < end) return mins >= start && mins < end
  // Wrap around midnight (e.g. 22:00 - 06:00)
  return mins >= start || mins < end
}

/**
 * Check if HEARTBEAT.md is effectively empty (only blank lines + headers)
 */
function isHeartbeatEmpty(content) {
  const lines = content.split('\n')
  return lines.every(l => {
    const trimmed = l.trim()
    return trimmed === '' || trimmed.startsWith('#')
  })
}

/**
 * Build heartbeat prompt from config + HEARTBEAT.md
 */
function buildHeartbeatPrompt(wsDir, config) {
  const hb = config.heartbeat || {}
  let prompt = hb.prompt || 'Read HEARTBEAT.md if it exists. Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.'

  // Append HEARTBEAT.md content if present
  if (wsDir) {
    const hbPath = path.join(wsDir, 'HEARTBEAT.md')
    if (fs.existsSync(hbPath)) {
      try {
        const content = fs.readFileSync(hbPath, 'utf8')
        if (isHeartbeatEmpty(content)) {
          return null // skip heartbeat entirely
        }
        prompt += '\n\n---\n\n' + content
      } catch {}
    }
  }

  return prompt
}

/**
 * Process heartbeat response — extract HEARTBEAT_OK, return alert text or null
 */
function processHeartbeatResponse(answer, ackMaxChars = 300) {
  if (!answer) return null
  const trimmed = answer.trim()

  // Check if HEARTBEAT_OK appears at start or end
  const startsOk = trimmed.startsWith('HEARTBEAT_OK')
  const endsOk = trimmed.endsWith('HEARTBEAT_OK')

  if (startsOk || endsOk) {
    // Strip HEARTBEAT_OK and check remaining content
    let remaining = trimmed
    if (startsOk) remaining = remaining.replace(/^HEARTBEAT_OK\s*/, '')
    if (endsOk) remaining = remaining.replace(/\s*HEARTBEAT_OK$/, '')
    remaining = remaining.trim()

    if (remaining.length <= ackMaxChars) {
      return null // ack, suppress
    }
  }

  // No HEARTBEAT_OK or significant content remains → alert
  return trimmed
}

// ── Legacy timer-based heartbeat (main.js uses this directly) ──

function startHeartbeat(chatFn) {
  stopHeartbeat()
  const { loadGlobalConfig } = require('./config')
  const config = loadGlobalConfig()
  const hb = config.heartbeat || {}
  if (hb.enabled === false) return
  const interval = (hb.intervalMinutes || 30) * 60 * 1000

  state.heartbeatTimer = setInterval(async () => {
    if (!state.mainWindow || !state.clawDir) return
    try {
      const prompt = hb.prompt || 'Check in: anything to report?'
      await chatFn(prompt, state.mainWindow)
    } catch (e) {
      console.warn('[heartbeat] Error:', e.message)
    }
  }, interval)
  console.log(`[heartbeat] Started (legacy), interval: ${hb.intervalMinutes || 30}m`)
}

function stopHeartbeat() {
  if (state.heartbeatTimer) {
    clearInterval(state.heartbeatTimer)
    state.heartbeatTimer = null
  }
}

// ── CronService delegation ──

function startHeartbeatCron(cronService, config) {
  if (!cronService) return
  const hb = config.heartbeat || {}
  if (hb.enabled === false) return

  const intervalMs = (hb.intervalMinutes || 30) * 60 * 1000

  const existing = cronService.getJob(HEARTBEAT_JOB_ID)
  if (existing) cronService.remove(HEARTBEAT_JOB_ID)

  cronService.add({
    name: 'Heartbeat',
    description: 'Periodic heartbeat check-in',
    schedule: { kind: 'every', everyMs: intervalMs, anchorMs: Date.now() },
    sessionTarget: 'main',
    wakeMode: 'now',
    text: 'Heartbeat: check if anything needs attention. Reply HEARTBEAT_OK if nothing.',
    enabled: true,
    deleteAfterRun: false,
  })

  console.log(`[heartbeat] Started via CronService, interval: ${hb.intervalMinutes || 30}m`)
}

function stopHeartbeatCron(cronService) {
  if (!cronService) return
  const existing = cronService.getJob(HEARTBEAT_JOB_ID)
  if (existing) cronService.remove(HEARTBEAT_JOB_ID)
}

module.exports = {
  startHeartbeat,
  stopHeartbeat,
  startHeartbeatCron,
  stopHeartbeatCron,
  HEARTBEAT_JOB_ID,
  // New OpenClaw-aligned exports
  isWithinActiveHours,
  isHeartbeatEmpty,
  buildHeartbeatPrompt,
  processHeartbeatResponse,
}
