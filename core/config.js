// core/config.js — Config loading (M32 refactor)
// Global config: {userData}/config.json (provider, apiKey, model, etc.)
// Workspace config: {workspace}/.paw/config.json (id, name, avatar, description)

const path = require('path')
const fs = require('fs')

let _globalConfigPath = null

// ── Global config (app-level) ──

function initGlobalConfig(userDataPath) {
  _globalConfigPath = path.join(userDataPath, 'config.json')
  // Migrate: if workspace has old-style config with provider/apiKey, lift to global
}

function globalConfigPath() {
  return _globalConfigPath
}

function loadGlobalConfig() {
  if (!_globalConfigPath) return {}
  try {
    return JSON.parse(fs.readFileSync(_globalConfigPath, 'utf8'))
  } catch {
    return {}
  }
}

function saveGlobalConfig(config) {
  if (!_globalConfigPath) return false
  fs.mkdirSync(path.dirname(_globalConfigPath), { recursive: true })
  fs.writeFileSync(_globalConfigPath, JSON.stringify(config, null, 2) + '\n', 'utf8')
  return true
}

// ── Workspace config (per-workspace, identity only) ──

function workspaceConfigPath(workspacePath) {
  if (!workspacePath) return null
  const newPath = path.join(workspacePath, '.paw', 'config.json')
  // Migrate from old location
  const oldPath = path.join(workspacePath, 'config.json')
  if (!fs.existsSync(newPath) && fs.existsSync(oldPath)) {
    fs.mkdirSync(path.join(workspacePath, '.paw'), { recursive: true })
    fs.renameSync(oldPath, newPath)
  }
  return newPath
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

// ── Migration: lift provider/apiKey/model from workspace to global ──

function migrateWorkspaceToGlobal(workspacePath) {
  const wsConfig = loadWorkspaceConfig(workspacePath)
  const globalConfig = loadGlobalConfig()

  const keysToLift = ['provider', 'apiKey', 'apiKeys', 'baseUrl', 'model', 'tavilyKey', 'execApproval', 'heartbeat', 'defaultCodingAgent']
  let migrated = false

  for (const key of keysToLift) {
    if (wsConfig[key] !== undefined && globalConfig[key] === undefined) {
      globalConfig[key] = wsConfig[key]
      migrated = true
    }
  }

  if (migrated) {
    saveGlobalConfig(globalConfig)
    // Clean workspace config: remove lifted keys, keep identity
    const p = workspaceConfigPath(workspacePath)
    if (p) {
      for (const key of keysToLift) delete wsConfig[key]
      fs.writeFileSync(p, JSON.stringify(wsConfig, null, 2) + '\n', 'utf8')
    }
  }

  return globalConfig
}

module.exports = {
  initGlobalConfig, globalConfigPath, loadGlobalConfig, saveGlobalConfig,
  workspaceConfigPath, loadWorkspaceConfig, migrateWorkspaceToGlobal,
}
