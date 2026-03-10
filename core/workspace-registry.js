// core/workspace-registry.js — Multi-workspace registry (M32/F162)
// Stores workspace paths at app level, loads identity for each

const path = require('path')
const fs = require('fs')
const { loadWorkspaceIdentity, saveWorkspaceIdentity, IDENTITY_FILE } = require('./workspace-identity')

let _registryPath = null  // set by init()
let _workspaces = []       // [{ id, path, identity }]

/**
 * Initialize registry with app-level storage path
 * @param {string} userDataPath - Electron app.getPath('userData')
 */
function initRegistry(userDataPath) {
  _registryPath = path.join(userDataPath, 'workspaces.json')
  _load()
}

function _load() {
  try {
    const raw = JSON.parse(fs.readFileSync(_registryPath, 'utf8'))
    _workspaces = (raw.workspaces || [])
      .filter(w => w && w.path)
      .map(w => _hydrateWorkspace(w))
  } catch {
    _workspaces = []
  }
}

function _save() {
  const data = { workspaces: _workspaces.map(w => ({ id: w.id, path: w.path })) }
  fs.writeFileSync(_registryPath, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function _hydrateWorkspace(w) {
  const identity = fs.existsSync(w.path) ? loadWorkspaceIdentity(w.path) : { name: path.basename(w.path), avatar: null, description: '' }
  return { id: w.id || _makeId(w.path), path: w.path, identity }
}

function _makeId(wsPath) {
  // Stable ID from path hash
  let h = 0
  for (const c of wsPath) h = ((h << 5) - h + c.charCodeAt(0)) | 0
  return 'ws_' + Math.abs(h).toString(36)
}

/**
 * List all registered workspaces with identity
 */
function listWorkspaces() {
  return _workspaces.map(w => ({
    id: w.id,
    path: w.path,
    identity: w.identity,
    exists: fs.existsSync(w.path),
  }))
}

/**
 * Get a single workspace by id
 */
function getWorkspace(id) {
  return _workspaces.find(w => w.id === id) || null
}

/**
 * Get workspace by path
 */
function getWorkspaceByPath(wsPath) {
  const resolved = path.resolve(wsPath)
  return _workspaces.find(w => path.resolve(w.path) === resolved) || null
}

/**
 * Add existing workspace folder to registry
 * Validates: folder exists and has SOUL.md or identity.json
 * @returns {{ ok: boolean, workspace?, error? }}
 */
function addWorkspace(wsPath) {
  const resolved = path.resolve(wsPath)
  if (!fs.existsSync(resolved)) return { ok: false, error: 'path_not_found' }

  // Check it's a valid workspace
  const hasSoul = fs.existsSync(path.join(resolved, 'SOUL.md'))
  const hasIdentity = fs.existsSync(path.join(resolved, IDENTITY_FILE))
  if (!hasSoul && !hasIdentity) return { ok: false, error: 'not_a_workspace' }

  // Check not already registered
  if (getWorkspaceByPath(resolved)) return { ok: false, error: 'already_registered' }

  const ws = _hydrateWorkspace({ path: resolved })
  _workspaces.push(ws)
  _save()
  return { ok: true, workspace: ws }
}

/**
 * Remove workspace from registry (does NOT delete folder)
 */
function removeWorkspace(id) {
  const idx = _workspaces.findIndex(w => w.id === id)
  if (idx === -1) return false
  _workspaces.splice(idx, 1)
  _save()
  return true
}

/**
 * Create new workspace folder with scaffolding + register it
 * @param {string} parentDir - parent directory
 * @param {string} name - workspace name (becomes folder name)
 * @param {object} [identity] - optional { avatar, description }
 * @returns {{ ok: boolean, workspace?, error? }}
 */
function createWorkspace(parentDir, name, identity = {}) {
  const folderName = name.replace(/[/\\:*?"<>|]/g, '_')
  const wsPath = path.join(parentDir, folderName)

  if (fs.existsSync(wsPath)) return { ok: false, error: 'folder_exists' }

  // Create folder structure
  fs.mkdirSync(wsPath, { recursive: true })
  fs.mkdirSync(path.join(wsPath, 'memory'), { recursive: true })
  fs.mkdirSync(path.join(wsPath, 'skills'), { recursive: true })
  fs.mkdirSync(path.join(wsPath, '.paw'), { recursive: true })

  // Scaffold files from templates
  const templatesDir = path.join(__dirname, '..', 'templates')
  for (const tpl of ['SOUL.md', 'USER.md', 'IDENTITY.md']) {
    const src = path.join(templatesDir, tpl)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(wsPath, tpl))
    }
  }

  // Create MEMORY.md
  fs.writeFileSync(path.join(wsPath, 'MEMORY.md'), '# Memory\n\n', 'utf8')

  // Save identity
  saveWorkspaceIdentity(wsPath, {
    name: name,
    avatar: identity.avatar || null,
    description: identity.description || '',
  })

  // Register
  return addWorkspace(wsPath)
}

/**
 * Update workspace identity and refresh cache
 */
function updateWorkspaceIdentity(id, updates) {
  const ws = getWorkspace(id)
  if (!ws) return null
  const newIdentity = { ...ws.identity, ...updates }
  saveWorkspaceIdentity(ws.path, newIdentity)
  ws.identity = newIdentity
  return ws
}

/**
 * Reload all workspace identities from disk
 */
function refreshAll() {
  _workspaces = _workspaces.map(w => _hydrateWorkspace(w))
}

module.exports = {
  initRegistry,
  listWorkspaces,
  getWorkspace,
  getWorkspaceByPath,
  addWorkspace,
  removeWorkspace,
  createWorkspace,
  updateWorkspaceIdentity,
  refreshAll,
}
