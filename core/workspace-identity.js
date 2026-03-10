// core/workspace-identity.js — Workspace identity (M32 refactor)
// Identity lives in .paw/config.json: { id, name, avatar, description }
// id = UUID, generated once, travels with the folder

const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const CONFIG_DIR = '.paw'
const CONFIG_FILE = 'config.json'

function _configPath(workspacePath) {
  return path.join(workspacePath, CONFIG_DIR, CONFIG_FILE)
}

function _readWsConfig(workspacePath) {
  try {
    return JSON.parse(fs.readFileSync(_configPath(workspacePath), 'utf8'))
  } catch {
    return {}
  }
}

function _writeWsConfig(workspacePath, config) {
  const dir = path.join(workspacePath, CONFIG_DIR)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(_configPath(workspacePath), JSON.stringify(config, null, 2) + '\n', 'utf8')
}

/**
 * Load workspace identity from .paw/config.json
 * Fallback: folder name as name, auto-generate id
 * Also migrates from legacy identity.json if present
 */
function loadWorkspaceIdentity(workspacePath) {
  let config = _readWsConfig(workspacePath)

  // Migrate from legacy identity.json
  const legacyPath = path.join(workspacePath, 'identity.json')
  if (fs.existsSync(legacyPath)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'))
      if (!config.name) config.name = legacy.name
      if (!config.avatar) config.avatar = legacy.avatar
      if (!config.description) config.description = legacy.description
      _writeWsConfig(workspacePath, config)
      fs.unlinkSync(legacyPath)  // remove legacy file after migration
    } catch {}
  }

  // Ensure id exists
  if (!config.id) {
    config.id = crypto.randomUUID()
    _writeWsConfig(workspacePath, config)
  }

  return {
    id: config.id,
    name: config.name || path.basename(workspacePath),
    avatar: config.avatar || null,
    description: config.description || '',
  }
}

/**
 * Save workspace identity fields to .paw/config.json
 * Merges with existing config (preserves other fields)
 */
function saveWorkspaceIdentity(workspacePath, identity) {
  const config = _readWsConfig(workspacePath)
  if (identity.name !== undefined) config.name = identity.name
  if (identity.avatar !== undefined) config.avatar = identity.avatar
  if (identity.description !== undefined) config.description = identity.description
  if (!config.id) config.id = crypto.randomUUID()
  _writeWsConfig(workspacePath, config)
  return {
    id: config.id,
    name: config.name || path.basename(workspacePath),
    avatar: config.avatar || null,
    description: config.description || '',
  }
}

/**
 * Get workspace ID (reads from .paw/config.json, auto-creates if missing)
 */
function getWorkspaceId(workspacePath) {
  return loadWorkspaceIdentity(workspacePath).id
}

module.exports = { loadWorkspaceIdentity, saveWorkspaceIdentity, getWorkspaceId }
