// core/api-keys.js — API Key Rotation
const state = require('./state');

function getApiKey(config) {
  if (Array.isArray(config.apiKeys) && config.apiKeys.length > 0) {
    return config.apiKeys[state.currentKeyIndex % config.apiKeys.length];
  }
  return config.apiKey;
}

function rotateApiKey(config) {
  if (Array.isArray(config.apiKeys) && config.apiKeys.length > 1) {
    state.currentKeyIndex = (state.currentKeyIndex + 1) % config.apiKeys.length;
    console.log(`[API] Rotated to key ${state.currentKeyIndex + 1}/${config.apiKeys.length}`);
    return true;
  }
  return false;
}

function recordKeyUsage(success) {
  if (!state.keyStats[state.currentKeyIndex]) {
    state.keyStats[state.currentKeyIndex] = { uses: 0, failures: 0 };
  }
  state.keyStats[state.currentKeyIndex].uses++;
  if (!success) state.keyStats[state.currentKeyIndex].failures++;
}

module.exports = { getApiKey, rotateApiKey, recordKeyUsage };
