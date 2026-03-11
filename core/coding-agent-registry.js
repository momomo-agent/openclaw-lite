// core/coding-agent-registry.js — User-configured coding agents (F206)
// Stores: [{ id, engine, projectPath, name }]

const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
function uuidv4() { return crypto.randomUUID() }

const GLOBAL_DIR = path.join(os.homedir(), '.paw')
const REGISTRY_PATH = path.join(GLOBAL_DIR, 'coding-agents.json')

let _agents = []

function init() {
  fs.mkdirSync(GLOBAL_DIR, { recursive: true })
  try {
    const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'))
    _agents = raw.agents || []
  } catch {
    _agents = []
  }
}

function _save() {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify({ agents: _agents }, null, 2) + '\n', 'utf8')
}

function list() {
  return _agents.map(a => ({ ...a }))
}

function add({ engine, projectPath, name }) {
  const id = uuidv4()
  const agent = { id, engine, projectPath, name }
  _agents.push(agent)
  _save()
  return agent
}

function remove(id) {
  const idx = _agents.findIndex(a => a.id === id)
  if (idx === -1) return false
  _agents.splice(idx, 1)
  _save()
  return true
}

module.exports = { init, list, add, remove }
