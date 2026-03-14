// core/workspace-registry.js — Multi-workspace registry (M32 refactor)
// Registry stores paths + type/engine for coding-agent workspaces.

const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
const { loadWorkspaceIdentity, saveWorkspaceIdentity } = require('./workspace-identity')

const GLOBAL_DIR = path.join(os.homedir(), '.paw')
let _registryPath = null
let _workspaces = []  // [{ id, path, type?, engine?, identity }]

function initRegistry() {
  fs.mkdirSync(GLOBAL_DIR, { recursive: true })
  _registryPath = path.join(GLOBAL_DIR, 'workspaces.json')
  _migrateCodingAgents()
  _load()
}

/**
 * Migrate old coding-agents.json → workspace records (one-time)
 * Each coding agent becomes a workspace with type='coding-agent'
 */
function _migrateCodingAgents() {
  const oldPath = path.join(GLOBAL_DIR, 'coding-agents.json')
  if (!fs.existsSync(oldPath)) return
  try {
    const old = JSON.parse(fs.readFileSync(oldPath, 'utf8'))
    const agents = old.agents || []
    if (agents.length === 0) { fs.unlinkSync(oldPath); return }

    // Load existing registry to merge
    let existing = { workspaces: [] }
    try { existing = JSON.parse(fs.readFileSync(_registryPath, 'utf8')) } catch {}
    const workspaces = existing.workspaces || []

    // Get identity info from coding-agents.js (if available)
    let codingAgentsModule = null
    try { codingAgentsModule = require('./coding-agents') } catch {}

    for (const agent of agents) {
      // Skip if already migrated (check by engine+path combo)
      const already = workspaces.find(w => w.type === 'coding-agent' && w.engine === agent.engine && w.path === agent.projectPath)
      if (already) continue

      // Get identity from coding-agents module
      let name = agent.name || agent.engine
      let avatar = null
      if (codingAgentsModule) {
        const info = (codingAgentsModule.listAvailable?.() || []).find(a => a.id === agent.engine)
        if (info) { name = info.name || name; avatar = info.avatar || null }
      }

      workspaces.push({
        id: agent.id || crypto.randomUUID(),
        path: agent.projectPath,
        type: 'coding-agent',
        engine: agent.engine,
        identity: { name, avatar }
      })
    }

    fs.writeFileSync(_registryPath, JSON.stringify({ workspaces }, null, 2) + '\n', 'utf8')
    fs.unlinkSync(oldPath)
    console.log(`[workspace-registry] Migrated ${agents.length} coding agents from coding-agents.json`)
  } catch (err) {
    console.warn('[workspace-registry] coding-agents migration error:', err.message)
  }
}

function _load() {
  try {
    const raw = JSON.parse(fs.readFileSync(_registryPath, 'utf8'))
    const seen = new Set()
    _workspaces = (raw.workspaces || [])
      .filter(w => w && w.path)
      .map(w => ({ ...w, path: path.resolve(w.path) }))
      .filter(w => {
        // coding-agent workspaces don't need to exist on disk (project may be removed)
        if (w.type !== 'coding-agent' && !fs.existsSync(w.path)) return false
        const key = w.type === 'coding-agent' ? `ca:${w.engine}:${w.path}` : w.path
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map(w => w.type === 'coding-agent' ? _hydrateCodingAgent(w) : _hydrateWorkspace(w.path))
  } catch {
    _workspaces = []
  }
}

function _save() {
  const data = {
    workspaces: _workspaces.map(w => {
      if (w.type === 'coding-agent') {
        return { id: w.id, path: w.path, type: w.type, engine: w.engine, identity: w.identity }
      }
      return { path: w.path }
    })
  }
  fs.writeFileSync(_registryPath, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function _hydrateWorkspace(wsPath) {
  const identity = loadWorkspaceIdentity(wsPath)
  return { id: identity.id, path: wsPath, type: 'local', identity }
}

function _hydrateCodingAgent(w) {
  // Refresh avatar from coding-agents.js definitions (keeps names from saved data)
  let avatar = w.identity?.avatar
  try {
    const codingAgents = require('./coding-agents')
    const agentDef = codingAgents.listAvailable().find(a => a.id === w.engine)
    if (agentDef?.avatar) avatar = agentDef.avatar
  } catch {}
  return {
    id: w.id,
    path: w.path,
    type: 'coding-agent',
    engine: w.engine,
    identity: { ...(w.identity || { name: w.engine }), avatar: avatar || null }
  }
}

function listWorkspaces() {
  return _workspaces.map(w => ({
    id: w.id,
    path: w.path,
    type: w.type || 'local',
    engine: w.engine,
    identity: w.identity,
    exists: w.type === 'coding-agent' || fs.existsSync(w.path),
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
  if (!hasSoul && !hasConfig) {
    // Auto-bootstrap: create .paw/config.json so any folder can become a workspace
    const pawDir = path.join(resolved, '.paw')
    fs.mkdirSync(pawDir, { recursive: true })
    const folderName = path.basename(resolved)
    fs.writeFileSync(path.join(pawDir, 'config.json'), JSON.stringify({
      id: folderName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      name: folderName,
      avatar: `preset:${Math.floor(Math.random() * 6)}`,
    }, null, 2) + '\n', 'utf8')
  }

  if (getWorkspaceByPath(resolved)) return { ok: false, error: 'already_registered' }

  const ws = _hydrateWorkspace(resolved)
  _workspaces.push(ws)
  _save()
  return { ok: true, workspace: ws }
}

/**
 * Add a coding-agent workspace (no .paw/config.json needed)
 * Coding agents are lightweight: identity stored in registry, not on disk.
 */
function addCodingAgentWorkspace(engine, projectPath) {
  const resolved = path.resolve(projectPath)

  // Check for duplicate engine+path
  const existing = _workspaces.find(w => w.type === 'coding-agent' && w.engine === engine && path.resolve(w.path) === resolved)
  if (existing) return existing

  // Get identity from coding-agents module
  let name = engine
  let avatar = null
  try {
    const codingAgentsModule = require('./coding-agents')
    const info = (codingAgentsModule.listAvailable?.() || []).find(a => a.id === engine)
    if (info) { name = info.name || name; avatar = info.avatar || null }
  } catch {}

  const ws = {
    id: crypto.randomUUID(),
    path: resolved,
    type: 'coding-agent',
    engine,
    identity: { name, avatar }
  }
  _workspaces.push(ws)
  _save()
  return ws
}

/**
 * Find a coding-agent workspace by engine + projectPath (for migration lookups)
 */
function findCodingAgentWorkspace(engine, projectPath) {
  const resolved = path.resolve(projectPath)
  return _workspaces.find(w => w.type === 'coding-agent' && w.engine === engine && path.resolve(w.path) === resolved) || null
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
  for (const tpl of ['SOUL.md', 'IDENTITY.md', 'HEARTBEAT.md']) {
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
    .filter(w => w.type === 'coding-agent' || fs.existsSync(w.path))
    .map(w => w.type === 'coding-agent' ? _hydrateCodingAgent(w) : _hydrateWorkspace(w.path))
}

module.exports = {
  initRegistry, listWorkspaces, getWorkspace, getWorkspaceByPath,
  addWorkspace, removeWorkspace, createWorkspace, updateWorkspaceIdentity, refreshAll,
  addCodingAgentWorkspace, findCodingAgentWorkspace,
}
