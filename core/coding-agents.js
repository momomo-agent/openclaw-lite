// core/coding-agents.js — Coding Agent availability + dispatch
// Three types: SDK (Claude Code), ACP (Gemini/Codex), CLI fallback
const { spawn, execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const home = require('os').homedir()
const { WHITELIST } = require('./acp-client')

// Common CLI install locations (Electron .app may not inherit shell PATH)
const COMMON_DIRS = [
  `${home}/.npm-global/bin`,
  `${home}/.volta/bin`,
  `${home}/.bun/bin`,
  '/usr/local/bin',
  '/opt/homebrew/bin',
  `${home}/.local/bin`,
  `${home}/Library/pnpm`,
  `${home}/.local/share/pnpm`,
]

function detectBin(name) {
  try {
    const which = execSync(`which ${name} 2>/dev/null`, { encoding: 'utf8' }).trim()
    if (which && fs.existsSync(which)) return which
  } catch {}
  for (const dir of COMMON_DIRS) {
    const p = `${dir}/${name}`
    if (fs.existsSync(p)) return p
  }
  try {
    const nvmDir = `${home}/.nvm/versions/node`
    if (fs.existsSync(nvmDir)) {
      for (const v of fs.readdirSync(nvmDir).sort().reverse()) {
        const p = `${nvmDir}/${v}/bin/${name}`
        if (fs.existsSync(p)) return p
      }
    }
  } catch {}
  try {
    const fnmDir = `${home}/.local/share/fnm/node-versions`
    if (fs.existsSync(fnmDir)) {
      for (const v of fs.readdirSync(fnmDir).sort().reverse()) {
        const p = `${fnmDir}/${v}/installation/bin/${name}`
        if (fs.existsSync(p)) return p
      }
    }
  } catch {}
  return null
}

// Resolve codex-acp bundled binary from node_modules
function resolveCodexAcpBin() {
  const platformMap = { darwin: 'darwin', linux: 'linux', win32: 'win32' }
  const archMap = { arm64: 'arm64', x64: 'x64' }
  const platform = platformMap[process.platform]
  const arch = archMap[process.arch]
  if (!platform || !arch) return null
  const pkgName = `@zed-industries/codex-acp-${platform}-${arch}`
  const binName = process.platform === 'win32' ? 'codex-acp.exe' : 'codex-acp'
  const candidate = path.resolve(__dirname, '..', 'node_modules', pkgName, 'bin', binName)
  if (fs.existsSync(candidate)) return candidate
  try { return require.resolve(`${pkgName}/bin/${binName}`) } catch {}
  return null
}

let _available = []
let _acpPaths = {} // id -> detected bin path for ACP agents
let _config = null // cached settings for API key checks

/**
 * Read coding agent config from settings.
 * Settings path: codingAgents.<agentId>.apiKey / .baseUrl / .model
 * Falls back to top-level apiKey/baseUrl for Claude Code.
 */
function getAgentConfig(agentId) {
  if (!_config) return null
  const agentConf = _config.codingAgents?.[agentId]
  if (agentConf?.apiKey) return agentConf
  // Claude Code fallback: use main apiKey if no agent-specific config
  if (agentId === 'claude' && _config.apiKey) {
    return {
      apiKey: Array.isArray(_config.apiKeys) ? _config.apiKeys[0] : _config.apiKey,
      baseUrl: _config.baseUrl,
      model: _config.model,
    }
  }
  return null
}

/**
 * Initialize available coding agents.
 * @param {object} [config] - Settings from ~/.paw/settings.json
 */
function init(config) {
  _available = []
  _acpPaths = {}
  _config = config || null

  for (const [id, entry] of Object.entries(WHITELIST)) {
    if (entry.useSdk) {
      // SDK agent (Claude Code) — available if API key is configured
      const conf = getAgentConfig(id)
      if (conf?.apiKey) {
        _available.push(id)
        console.log(`[coding-agents] ${id} available (SDK, has API key)`)
      } else {
        console.log(`[coding-agents] ${id} skipped (no API key)`)
      }
    } else if (entry.useAcp) {
      // ACP agent — needs local binary
      let binPath = null
      if (entry.bundledBin) {
        binPath = resolveCodexAcpBin()
      } else if (entry.bin) {
        binPath = detectBin(entry.bin)
      }
      if (binPath) {
        _acpPaths[id] = binPath
        _available.push(id)
        console.log(`[coding-agents] ${id} available (ACP) at ${binPath}`)
      }
    }
  }
  console.log(`[coding-agents] available: ${_available.length ? _available.join(', ') : 'none'}`)
}

function listAvailable() {
  return _available.map(id => {
    const entry = WHITELIST[id]
    return {
      id,
      name: entry?.name || id,
      avatar: entry?.avatar || '../avatars/default.png',
      provider: entry?.provider,
    }
  })
}

function isAvailable(agentId) {
  return _available.includes(agentId)
}

/**
 * Run a coding agent.
 * SDK agents are dispatched via coding-agent-router → claude-code-sdk.
 * ACP agents are dispatched via acp-client.
 */
function run(agentId, prompt, opts) {
  const entry = WHITELIST[agentId]
  if (!entry) throw new Error(`Unknown coding agent '${agentId}'`)

  if (entry.useAcp) {
    const binPath = _acpPaths[agentId]
    if (!binPath) throw new Error(`Coding agent '${agentId}' binary not found`)
    const { runAcp } = require('./acp-client')
    return runAcp({
      bin: binPath,
      acpArgs: entry.acpArgs || [],
      prompt,
      cwd: opts.cwd,
      onOutput: opts.onOutput,
      onProcess: opts.onProcess,
    })
  }

  // SDK agents (Claude Code) — handled by coding-agent-router.js
  // This run() shouldn't be called for SDK agents; router dispatches directly.
  throw new Error(`Coding agent '${agentId}' uses SDK, dispatch via coding-agent-router`)
}

module.exports = { init, listAvailable, isAvailable, run, getAgentConfig }
