// core/workspace-identity.js — Workspace identity (M32/F161)
// identity.json schema: { name: string, avatar: string|null, description: string }
// avatar = relative path to image file in workspace folder, or emoji string

const path = require('path')
const fs = require('fs')

const IDENTITY_FILE = 'identity.json'

/**
 * Load workspace identity from identity.json
 * Fallback: folder name as name, default emoji as avatar
 */
function loadWorkspaceIdentity(workspacePath) {
  const defaults = {
    name: path.basename(workspacePath),
    avatar: null,   // null = use default emoji in renderer
    description: '',
  }

  const idPath = path.join(workspacePath, IDENTITY_FILE)
  try {
    const raw = JSON.parse(fs.readFileSync(idPath, 'utf8'))
    return {
      name: raw.name || defaults.name,
      avatar: raw.avatar || defaults.avatar,
      description: raw.description || defaults.description,
    }
  } catch {
    return defaults
  }
}

/**
 * Save workspace identity to identity.json
 */
function saveWorkspaceIdentity(workspacePath, identity) {
  const idPath = path.join(workspacePath, IDENTITY_FILE)
  const data = {
    name: identity.name || path.basename(workspacePath),
    avatar: identity.avatar || null,
    description: identity.description || '',
  }
  fs.writeFileSync(idPath, JSON.stringify(data, null, 2) + '\n', 'utf8')
  return data
}

/**
 * Resolve avatar to absolute path (if it's a relative file path, not emoji)
 */
function resolveAvatarPath(workspacePath, avatar) {
  if (!avatar) return null
  // Emoji check: if it's very short and not a file extension pattern, treat as emoji
  if (avatar.length <= 4 && !avatar.includes('.')) return avatar
  // Resolve relative path
  const abs = path.resolve(workspacePath, avatar)
  if (fs.existsSync(abs)) return abs
  return avatar  // return as-is if file not found
}

module.exports = { loadWorkspaceIdentity, saveWorkspaceIdentity, resolveAvatarPath, IDENTITY_FILE }
