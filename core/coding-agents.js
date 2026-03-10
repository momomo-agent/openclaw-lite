// core/coding-agents.js — Coding Agent CLI adapter layer
// Unified interface for CLI coding agents (claude, codex, gemini, kiro)
const { spawn, execSync } = require('child_process')

const agents = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    bin: 'claude',
    _path: null,
    detect() {
      try {
        const which = execSync('which claude 2>/dev/null', { encoding: 'utf8' }).trim()
        if (which && require('fs').existsSync(which)) {
          this._path = which
          return true
        }
      } catch {}
      return false
    },
    run(prompt, { cwd, session, onOutput, onProcess }) {
      const args = ['--print', '--permission-mode', 'bypassPermissions']
      if (session) args.push('--resume', session)
      args.push(prompt)
      return _spawnAgent(this._path, args, { cwd, onOutput, onProcess })
    },
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    bin: 'codex',
    _path: null,
    detect() {
      try {
        const which = execSync('which codex 2>/dev/null', { encoding: 'utf8' }).trim()
        if (which && require('fs').existsSync(which)) {
          this._path = which
          return true
        }
      } catch {}
      return false
    },
    run(prompt, { cwd, session, onOutput, onProcess }) {
      const args = [prompt]
      return _spawnAgent(this._path, args, { cwd, onOutput, onProcess })
    },
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini CLI',
    bin: 'gemini',
    _path: null,
    detect() {
      try {
        const which = execSync('which gemini 2>/dev/null', { encoding: 'utf8' }).trim()
        if (which && require('fs').existsSync(which)) {
          this._path = which
          return true
        }
      } catch {}
      return false
    },
    run(prompt, { cwd, session, onOutput, onProcess }) {
      const args = [prompt]
      return _spawnAgent(this._path, args, { cwd, onOutput, onProcess })
    },
  },
  kiro: {
    id: 'kiro',
    name: 'Kiro',
    bin: 'kiro',
    _path: null,
    detect() {
      try {
        const which = execSync('which kiro 2>/dev/null', { encoding: 'utf8' }).trim()
        if (which && require('fs').existsSync(which)) {
          this._path = which
          return true
        }
      } catch {}
      return false
    },
    run(prompt, { cwd, session, onOutput, onProcess }) {
      const args = [prompt]
      return _spawnAgent(this._path, args, { cwd, onOutput, onProcess })
    },
  },
}

// Shared spawn helper with streaming + process exposure
function _spawnAgent(bin, args, { cwd, onOutput, onProcess, timeout = 600000 }) {
  console.log(`[coding-agents] spawning: ${bin} ${args.join(' ')}`)

  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''

    const proc = spawn(bin, args, {
      cwd: cwd || process.cwd(),
      env: { ...process.env, TERM: 'dumb' },
    })

    console.log(`[coding-agents] spawned pid=${proc.pid}`)
    if (onProcess) onProcess(proc)

    const timer = timeout ? setTimeout(() => {
      if (proc && !proc.killed) {
        proc.kill('SIGTERM')
        setTimeout(() => { if (proc && !proc.killed) proc.kill('SIGKILL') }, 2000)
      }
    }, timeout) : null

    proc.stdout.on('data', (data) => {
      const chunk = data.toString()
      stdout += chunk
      if (onOutput) onOutput(chunk)
    })

    proc.stderr.on('data', (data) => {
      const chunk = data.toString()
      stderr += chunk
      if (onOutput) onOutput(chunk)  // Show stderr in output too
    })

    proc.on('close', (code) => {
      if (timer) clearTimeout(timer)
      resolve({ stdout, stderr, code })
    })

    proc.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(err)
    })
  })
}

let _available = []

function init() {
  _available = []
  for (const [id, agent] of Object.entries(agents)) {
    if (agent.detect()) {
      _available.push(id)
      console.log(`[coding-agents] ${id} available at ${agent._path}`)
    }
  }
  console.log(`[coding-agents] available: ${_available.length ? _available.join(', ') : 'none'}`)
}

function listAvailable() {
  return _available.map(id => ({ id, name: agents[id].name }))
}

function isAvailable(agentId) {
  return _available.includes(agentId)
}

function run(agentId, prompt, opts) {
  const agent = agents[agentId]
  if (!agent || !agent._path) throw new Error(`Coding agent '${agentId}' not available`)
  return agent.run(prompt, opts)
}

module.exports = { init, listAvailable, isAvailable, run }
