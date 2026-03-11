// core/heartbeat.js — Heartbeat timer (delegates to CronService when available)
const state = require('./state');

// Heartbeat job ID constant for CronService delegation
const HEARTBEAT_JOB_ID = '__heartbeat__';

/**
 * Start heartbeat via CronService
 * @param {Object} cronService - CronService instance
 * @param {Object} config - { heartbeat: { enabled, intervalMinutes } }
 */
function startHeartbeatCron(cronService, config) {
  if (!cronService) return;
  const hb = config.heartbeat || {};
  if (hb.enabled === false) return;

  const intervalMs = (hb.intervalMinutes || 30) * 60 * 1000;

  // Remove existing heartbeat job if any
  const existing = cronService.getJob(HEARTBEAT_JOB_ID);
  if (existing) cronService.remove(HEARTBEAT_JOB_ID);

  // Add heartbeat as a cron job
  const result = cronService.add({
    name: 'Heartbeat',
    description: 'Periodic heartbeat check-in',
    schedule: { kind: 'every', everyMs: intervalMs, anchorMs: Date.now() },
    sessionTarget: 'main',
    wakeMode: 'now',
    text: 'Heartbeat: check if anything needs attention. Reply HEARTBEAT_OK if nothing.',
    enabled: true,
    deleteAfterRun: false,
  });

  // Patch the ID to our known constant so we can find/remove it
  if (result.id) {
    const job = cronService.getJob(result.id);
    if (job) job.id = HEARTBEAT_JOB_ID;
  }

  console.log(`[heartbeat] Started via CronService, interval: ${hb.intervalMinutes || 30}m`);
}

/**
 * Stop heartbeat via CronService
 */
function stopHeartbeatCron(cronService) {
  if (!cronService) return;
  const existing = cronService.getJob(HEARTBEAT_JOB_ID);
  if (existing) cronService.remove(HEARTBEAT_JOB_ID);
}

// Legacy fallback (used when CronService is not available)
function startHeartbeat(chatFn) {
  stopHeartbeat();
  const { loadGlobalConfig } = require('./config');
  const config = loadGlobalConfig();
  const hb = config.heartbeat || {};
  if (hb.enabled === false) return;
  const interval = (hb.intervalMinutes || 30) * 60 * 1000;

  state.heartbeatTimer = setInterval(async () => {
    if (!state.mainWindow || !state.clawDir) return;
    try {
      const prompt = hb.prompt || 'Check in: anything to report?';
      await chatFn(prompt, state.mainWindow);
    } catch (e) {
      console.warn('[heartbeat] Error:', e.message);
    }
  }, interval);
  console.log(`[heartbeat] Started (legacy), interval: ${hb.intervalMinutes || 30}m`);
}

function stopHeartbeat() {
  if (state.heartbeatTimer) {
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = null;
  }
}

module.exports = {
  startHeartbeat,
  stopHeartbeat,
  startHeartbeatCron,
  stopHeartbeatCron,
  HEARTBEAT_JOB_ID
};
