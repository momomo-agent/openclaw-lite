// core/config.js — Config loading (M32)
// Global config: ~/.paw/settings.json (provider, apiKey, model, etc.)
// Workspace config: {workspace}/.paw/config.json (id, name, avatar, description)

const path = require('path')
const fs = require('fs')
const os = require('os')

const GLOBAL_DIR = path.join(os.homedir(), '.paw')
const GLOBAL_CONFIG = path.join(GLOBAL_DIR, 'settings.json')

function globalConfigPath() {
  return GLOBAL_CONFIG
}

function loadGlobalConfig() {
  try {
    return JSON.parse(fs.readFileSync(GLOBAL_CONFIG, 'utf8'))
  } catch {
    return {}
  }
}

function saveGlobalConfig(config) {
  fs.mkdirSync(GLOBAL_DIR, { recursive: true })
  fs.writeFileSync(GLOBAL_CONFIG, JSON.stringify(config, null, 2) + '\n', 'utf8')
  return true
}

// ── Workspace config (per-workspace, identity only) ──

function workspaceConfigPath(workspacePath) {
  if (!workspacePath) return null
  return path.join(workspacePath, '.paw', 'config.json')
}

function loadWorkspaceConfig(workspacePath) {
  const p = workspaceConfigPath(workspacePath)
  if (!p) return {}
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return {}
  }
}

module.exports = {
  globalConfigPath, loadGlobalConfig, saveGlobalConfig,
  workspaceConfigPath, loadWorkspaceConfig,
}
