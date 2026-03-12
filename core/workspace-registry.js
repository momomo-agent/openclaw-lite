// core/workspace-registry.js — Multi-workspace registry (M32 refactor)
// Registry only stores paths. ID lives in workspace's .paw/config.json.

const path = require('path')
const fs = require('fs')
const os = require('os')
const { loadWorkspaceIdentity, saveWorkspaceIdentity } = require('./workspace-identity')

const GLOBAL_DIR = path.join(os.homedir(), '.paw')
let _registryPath = null
let _workspaces = []  // [{ id, path, identity }]

function initRegistry() {
  fs.mkdirSync(GLOBAL_DIR, { recursive: true })
  _registryPath = path.join(GLOBAL_DIR, 'workspaces.json')
  _load()
}

function _load() {
  try {
    const raw = JSON.parse(fs.readFileSync(_registryPath, 'utf8'))
    const seen = new Set()
    _workspaces = (raw.workspaces || [])
      .filter(w => w && w.path)
      .map(w => ({ ...w, path: path.resolve(w.path) }))
      .filter(w => {
        if (!fs.existsSync(w.path)) return false
        if (seen.has(w.path)) return false
        seen.add(w.path)
        return true
      })
      .map(w => _hydrateWorkspace(w.path))
  } catch {
    _workspaces = []
  }
}

function _save() {
  const data = { workspaces: _workspaces.map(w => ({ path: w.path })) }
  fs.writeFileSync(_registryPath, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function _hydrateWorkspace(wsPath) {
  const identity = loadWorkspaceIdentity(wsPath)
  return { id: identity.id, path: wsPath, identity }
}

function listWorkspaces() {
  return _workspaces.map(w => ({
    id: w.id,
    path: w.path,
    identity: w.identity,
    exists: fs.existsSync(w.path),
  }))
}

function getWorkspace(id) {
  return _workspaces.find(w => w.id === id) || null
}

function getWorkspaceByPath(wsPath) {
  const resolved = path.resolve(wsPath)
  return _workspaces.find(w => path.resolve(w.path) === resolved) || null
}

/**
 * Add existing workspace folder to registry
 * Validates: folder exists and has SOUL.md or .paw/config.json
 */
function addWorkspace(wsPath) {
  const resolved = path.resolve(wsPath)
  if (!fs.existsSync(resolved)) return { ok: false, error: 'path_not_found' }

  const hasSoul = fs.existsSync(path.join(resolved, 'SOUL.md'))
  const hasConfig = fs.existsSync(path.join(resolved, '.paw', 'config.json'))
  if (!hasSoul && !hasConfig) return { ok: false, error: 'not_a_workspace' }

  if (getWorkspaceByPath(resolved)) return { ok: false, error: 'already_registered' }

  const ws = _hydrateWorkspace(resolved)
  _workspaces.push(ws)
  _save()
  return { ok: true, workspace: ws }
}

function removeWorkspace(id) {
  const idx = _workspaces.findIndex(w => w.id === id)
  if (idx === -1) return false
  _workspaces.splice(idx, 1)
  _save()
  return true
}

/**
 * Create new workspace folder with scaffolding + register it
 * OpenClaw-aligned: seeds all template files + conditional BOOTSTRAP.md
 */
function createWorkspace(parentDir, name, opts = {}) {
  const folderName = name.replace(/[/\\:*?"<>|]/g, '_')
  const wsPath = path.join(parentDir, folderName)

  if (fs.existsSync(wsPath)) return { ok: false, error: 'folder_exists' }

  fs.mkdirSync(wsPath, { recursive: true })
  fs.mkdirSync(path.join(wsPath, 'memory'), { recursive: true })
  fs.mkdirSync(path.join(wsPath, 'skills'), { recursive: true })
  fs.mkdirSync(path.join(wsPath, '.paw'), { recursive: true })

  // Scaffold files from templates (write-if-missing, like OpenClaw's wx flag)
  const templatesDir = path.join(__dirname, '..', 'templates')
  for (const tpl of ['SOUL.md', 'USER.md', 'IDENTITY.md', 'AGENTS.md', 'HEARTBEAT.md']) {
    const src = path.join(templatesDir, tpl)
    const dst = path.join(wsPath, tpl)
    if (fs.existsSync(src) && !fs.existsSync(dst)) fs.copyFileSync(src, dst)
  }
  const memoryPath = path.join(wsPath, 'MEMORY.md')
  if (!fs.existsSync(memoryPath)) fs.writeFileSync(memoryPath, '# Memory\n\n', 'utf8')

  // BOOTSTRAP.md — only for brand-new workspaces (OpenClaw-aligned)
  const bootstrapSrc = path.join(templatesDir, 'BOOTSTRAP.md')
  const bootstrapDst = path.join(wsPath, 'BOOTSTRAP.md')
  if (fs.existsSync(bootstrapSrc) && !fs.existsSync(bootstrapDst)) {
    fs.copyFileSync(bootstrapSrc, bootstrapDst)
  }

  // Save identity into .paw/config.json (with auto-generated UUID)
  saveWorkspaceIdentity(wsPath, {
    name,
    avatar: opts.avatar || null,
    description: opts.description || '',
  })

  return addWorkspace(wsPath)
}

function updateWorkspaceIdentity(id, updates) {
  const ws = getWorkspace(id)
  if (!ws) return null
  const newIdentity = saveWorkspaceIdentity(ws.path, updates)
  ws.identity = newIdentity
  ws.id = newIdentity.id  // should be stable but just in case
  return ws
}

function refreshAll() {
  _workspaces = _workspaces
    .filter(w => fs.existsSync(w.path))
    .map(w => _hydrateWorkspace(w.path))
}

module.exports = {
  initRegistry, listWorkspaces, getWorkspace, getWorkspaceByPath,
  addWorkspace, removeWorkspace, createWorkspace, updateWorkspaceIdentity, refreshAll,
}
