// core/workspace-identity.js — Workspace identity (M32)
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

function _ensureAvatar(workspacePath, config) {
  const avatarDest = path.join(workspacePath, CONFIG_DIR, 'avatar.png')

  // If avatar is already an image file AND the file exists, nothing to do
  if (config.avatar && config.avatar.includes('.') && fs.existsSync(avatarDest)) return config

  // If file exists but config doesn't point to it, fix config
  if (fs.existsSync(avatarDest)) {
    config.avatar = 'avatar.png'
    _writeWsConfig(workspacePath, config)
    return config
  }

  // Pick a random preset (1-5) and copy it
  const presetIndex = Math.floor(Math.random() * 5) + 1
  const presetsDir = path.join(__dirname, '..', 'renderer', 'avatars')
  const src = path.join(presetsDir, `${presetIndex}.png`)
  try {
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.join(workspacePath, CONFIG_DIR), { recursive: true })
      fs.copyFileSync(src, avatarDest)
      config.avatar = 'avatar.png'
      _writeWsConfig(workspacePath, config)
    }
  } catch { /* ignore copy errors */ }
  return config
}

function loadWorkspaceIdentity(workspacePath) {
  let config = _readWsConfig(workspacePath)

  // Ensure id exists
  if (!config.id) {
    config.id = crypto.randomUUID()
    _writeWsConfig(workspacePath, config)
  }

  // Ensure avatar image exists
  config = _ensureAvatar(workspacePath, config)

  return {
    id: config.id,
    name: config.name || path.basename(workspacePath),
    avatar: config.avatar || null,
    description: config.description || '',
  }
}

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

function getWorkspaceId(workspacePath) {
  return loadWorkspaceIdentity(workspacePath).id
}

module.exports = { loadWorkspaceIdentity, saveWorkspaceIdentity, getWorkspaceId }
