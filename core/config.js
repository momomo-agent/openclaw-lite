// core/config.js — 配置加载（含旧路径迁移）
const path = require('path');
const fs = require('fs');
const state = require('./state');

function configPath() {
  if (!state.clawDir) return null;
  const newPath = path.join(state.clawDir, '.paw', 'config.json');
  // Migrate from old location if needed
  const oldPath = path.join(state.clawDir, 'config.json');
  if (!fs.existsSync(newPath) && fs.existsSync(oldPath)) {
    fs.mkdirSync(path.join(state.clawDir, '.paw'), { recursive: true });
    fs.renameSync(oldPath, newPath);
  }
  return newPath;
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
