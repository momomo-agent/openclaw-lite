// core/acp-client.js — ACP (Agent Client Protocol) client for Paw
// Connects to coding agents via the standard ACP protocol (stdio NDJSON)
const { spawn } = require('child_process')
const { Readable, Writable } = require('stream')

// Whitelist: only these agents are detected and shown to users.
// An agent must pass E2E verification before being added here.
const WHITELIST = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    avatar: '../avatars/claude.png',
    bin: 'claude',
    // Claude Code uses direct SDK, not ACP — handled by coding-agents.js
    useAcp: false,
  },
  // Gemini and Codex will be added here after ACP E2E verification passes.
  // gemini: { id: 'gemini', name: 'Gemini CLI', bin: 'gemini', acpArgs: ['--acp'], useAcp: true },
  // codex: { id: 'codex', name: 'Codex', bin: 'codex', acpArgs: ['mcp-server'], useAcp: true },
}

let _sdk = null

async function loadSdk() {
  if (!_sdk) {
    _sdk = await import('@agentclientprotocol/sdk')
  }
  return _sdk
}

/**
 * Create an ACP client connection to a coding agent.
 * @param {object} opts
 * @param {string} opts.bin - Path to agent binary
 * @param {string[]} opts.acpArgs - Args to start agent in ACP mode
 * @param {string} opts.cwd - Working directory
 * @param {function} [opts.onText] - Callback for streamed text chunks
 * @param {function} [opts.onToolCall] - Callback for tool call notifications
 * @param {function} [opts.onProcess] - Callback with child process
 * @returns {Promise<{prompt: function, cancel: function, close: function, sessionId: string}>}
 */
async function createAcpSession(opts) {
  const { ClientSideConnection, PROTOCOL_VERSION, ndJsonStream } = await loadSdk()
  const { bin, acpArgs = [], cwd, onText, onToolCall, onProcess } = opts

  const agent = spawn(bin, acpArgs, {
    stdio: ['pipe', 'pipe', 'inherit'],
    cwd: cwd || process.cwd(),
    env: { ...process.env, TERM: 'dumb' },
  })

  if (onProcess) onProcess(agent)

  if (!agent.stdin || !agent.stdout) {
    throw new Error('Failed to create ACP stdio pipes')
  }

  const input = Writable.toWeb(agent.stdin)
  const output = Readable.toWeb(agent.stdout)
  const stream = ndJsonStream(input, output)

  const client = new ClientSideConnection(
    () => ({
      sessionUpdate: async (params) => {
        const update = params.update
        if (!('sessionUpdate' in update)) return

        switch (update.sessionUpdate) {
          case 'agent_message_chunk':
            if (update.content?.type === 'text' && onText) {
              onText(update.content.text)
            }
            break
          case 'tool_call':
            if (onToolCall) {
              onToolCall({ title: update.title, status: update.status, toolCallId: update.toolCallId })
            }
            break
          case 'tool_call_update':
            if (onToolCall) {
              onToolCall({ toolCallId: update.toolCallId, status: update.status, isUpdate: true })
            }
            break
        }
      },
      requestPermission: async (params) => {
        // Auto-approve all tools (equivalent to bypassPermissions)
        const allowOption = params.options?.find(o => o.kind === 'allow_once' || o.kind === 'allow_always')
        if (allowOption) {
          return { outcome: { outcome: 'selected', optionId: allowOption.optionId } }
        }
        return { outcome: { outcome: 'cancelled' } }
      },
    }),
    stream,
  )

  await client.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    },
    clientInfo: { name: 'paw', version: '0.23.0' },
  })

  const session = await client.newSession({
    cwd: cwd || process.cwd(),
    mcpServers: [],
  })

  return {
    sessionId: session.sessionId,

    async prompt(text) {
      const response = await client.prompt({
        sessionId: session.sessionId,
        prompt: [{ type: 'text', text }],
      })
      return response
    },

    async cancel() {
      try {
        await client.cancel({ sessionId: session.sessionId })
      } catch {}
    },

    close() {
      try { agent.kill() } catch {}
    },

    agent,
    client,
  }
}

/**
 * Run a one-shot prompt via ACP.
 * @param {object} opts
 * @param {string} opts.bin - Path to agent binary
 * @param {string[]} opts.acpArgs - Args to start agent in ACP mode
 * @param {string} opts.prompt - The prompt text
 * @param {string} opts.cwd - Working directory
 * @param {function} [opts.onOutput] - Callback for streamed text
 * @param {function} [opts.onProcess] - Callback with child process
 * @returns {Promise<{stdout: string, code: number}>}
 */
async function runAcp(opts) {
  let fullText = ''

  const session = await createAcpSession({
    bin: opts.bin,
    acpArgs: opts.acpArgs,
    cwd: opts.cwd,
    onText: (text) => {
      fullText += text
      if (opts.onOutput) opts.onOutput(text)
    },
    onProcess: opts.onProcess,
  })

  try {
    const response = await session.prompt(opts.prompt)
    return { stdout: fullText, code: 0, stopReason: response.stopReason }
  } catch (err) {
    return { stdout: fullText, code: 1, error: err.message }
  } finally {
    session.close()
  }
}

module.exports = { WHITELIST, createAcpSession, runAcp }
