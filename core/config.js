// core/config.js — 配置加载
const path = require('path');
const fs = require('fs');
const state = require('./state');

function configPath() {
  if (!state.clawDir) return null;
  const p = path.join(state.clawDir, 'config.json');
  return fs.existsSync(p) ? p : null;
}

function loadConfig() {
  const p = configPath();
  if (!p) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

module.exports = { configPath, loadConfig };
