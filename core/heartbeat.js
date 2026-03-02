// core/heartbeat.js — Heartbeat 定时器
const state = require('./state');
const { loadConfig } = require('./config');

function startHeartbeat(chatFn) {
  stopHeartbeat();
  const config = loadConfig();
  const interval = (config.heartbeatIntervalMin || 30) * 60 * 1000;
  if (!config.heartbeatEnabled) return;

  state.heartbeatTimer = setInterval(async () => {
    if (!state.mainWindow || !state.clawDir) return;
    try {
      const prompt = config.heartbeatPrompt || 'Check in: anything to report?';
      await chatFn(prompt, state.mainWindow);
    } catch (e) {
      console.warn('[heartbeat] Error:', e.message);
    }
  }, interval);
  console.log(`[heartbeat] Started, interval: ${config.heartbeatIntervalMin || 30}m`);
}

function stopHeartbeat() {
  if (state.heartbeatTimer) {
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = null;
  }
}

module.exports = { startHeartbeat, stopHeartbeat };
