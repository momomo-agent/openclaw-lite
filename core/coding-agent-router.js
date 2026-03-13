/**
 * core/coding-agent-router.js — Coding agent routing + CC session persistence
 * Extracted from main.js M39 refactor.
 *
 * Handles: routeToCodingAgent, routeToCodingAgentSDK, streamCodingAgent,
 *          CC session persistence (sessionCCSessions map + .paw/cc-sessions.json)
 */
const path = require('path')
const fs = require('fs')
const eventBus = require('./event-bus')
const codingAgents = require('./coding-agents')
const workspaceRegistry = require('./workspace-registry')

// Persistent map: ccSessionKey → Claude Code SDK session ID
// Survives app restart so coding agents don't lose conversation history
const sessionCCSessions = new Map()
const CC_SESSIONS_FILE = '.paw/cc-sessions.json'

function loadCCSessions() {
  const workspaces = workspaceRegistry.listWorkspaces()
  for (const ws of workspaces) {
    if (ws.type !== 'coding-agent' && ws.path) {
      const filePath = path.join(ws.path, CC_SESSIONS_FILE)
      try {
        if (fs.existsSync(filePath)) {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
          for (const [k, v] of Object.entries(data)) {
            sessionCCSessions.set(k, v)
          }
        }
      } catch {}
    }
  }
}

function saveCCSession(ccSessionKey, ccSessionId) {
  sessionCCSessions.set(ccSessionKey, ccSessionId)
  // Persist to the workspace that owns this session
  const workspaces = workspaceRegistry.listWorkspaces()
  const localWs = workspaces.find(w => w.type !== 'coding-agent' && w.path)
  if (localWs) {
    const filePath = path.join(localWs.path, CC_SESSIONS_FILE)
    try {
      const obj = {}
      for (const [k, v] of sessionCCSessions.entries()) obj[k] = v
      fs.writeFileSync(filePath, JSON.stringify(obj, null, 2))
    } catch (err) {
      console.warn('[cc-sessions] save error:', err.message)
    }
  }
}

async function routeToCodingAgent(workspace, message, { sessionId, requestId, senderName, senderAvatar }, ctx) {
  const { engine, path: workdir, identity } = workspace
  const agentName = identity?.name || engine
  const agentAvatar = identity?.avatar

  // Claude engine → use SDK for real-time streaming
  if (engine === 'claude') {
    return routeToCodingAgentSDK(workspace, message, { sessionId, requestId, senderName, senderAvatar }, ctx)
  }

  // Other engines (codex, gemini, kiro) → fallback to CLI
  if (!codingAgents.isAvailable(engine)) {
    return `Error: coding agent '${engine}' not available`
  }

  const parentRequestId = requestId || ctx._activeRequestId
  if (parentRequestId && senderName) {
    eventBus.dispatch('chat-delegate-start', { requestId: parentRequestId, sender: senderName, workspaceId: workspace.id, avatar: senderAvatar, sessionId })
  } else if (parentRequestId) {
    eventBus.dispatch('chat-text-start', { requestId: parentRequestId, sessionId })
  }

  let output = ''
  const ccSessionKey = `${sessionId}-${engine}-${workdir}`
  const existingSession = sessionCCSessions.get(ccSessionKey)

  try {
    const result = await codingAgents.run(engine, message, {
      cwd: workdir,
      session: existingSession,
      onOutput: (chunk) => {
        output += chunk
        if (parentRequestId && senderName) {
          eventBus.dispatch('chat-delegate-token', { requestId: parentRequestId, sender: senderName, token: chunk, sessionId })
        } else if (parentRequestId) {
          eventBus.dispatch('chat-token', { requestId: parentRequestId, text: chunk, sessionId })
        }
      }
    })

    if (parentRequestId && senderName) {
      eventBus.dispatch('chat-delegate-end', { requestId: parentRequestId, sender: senderName, sessionId })
    }

    return output || result.stdout || 'Coding agent completed'
  } catch (err) {
    if (parentRequestId && senderName) {
      eventBus.dispatch('chat-delegate-end', { requestId: parentRequestId, sender: senderName, sessionId })
    }
    return `Error: ${err.message}`
  }
}

async function routeToCodingAgentSDK(workspace, message, { sessionId, requestId, senderName, senderAvatar }, ctx) {
  const { ClaudeCodeSession } = require('./claude-code-sdk')
  const { getApiKey } = require('./api-keys')

  const { engine, path: workdir, identity } = workspace
  const agentName = identity?.name || engine
  const agentAvatar = identity?.avatar

  const parentRequestId = requestId || ctx._activeRequestId
  if (parentRequestId && senderName) {
    eventBus.dispatch('chat-delegate-start', { requestId: parentRequestId, sender: senderName, workspaceId: workspace.id, avatar: senderAvatar, sessionId })
  } else if (parentRequestId) {
    eventBus.dispatch('chat-text-start', { requestId: parentRequestId, sessionId, agentName, avatar: agentAvatar })
  }

  let output = ''
  const ccSessionKey = `${sessionId}-${engine}-${workdir}`
  const existingSessionId = sessionCCSessions.get(ccSessionKey)

  // Get API key, base URL, and model from config
  const config = ctx.loadConfig()
  const apiKey = getApiKey(config)
  const baseUrl = config.baseUrl
  const model = config.model || 'claude-opus-4-6'

  const session = new ClaudeCodeSession({
    cwd: workdir,
    sessionId: existingSessionId,
    apiKey,
    baseUrl,
    model,
    onToken: (delta) => {
      output += delta
      if (parentRequestId && senderName) {
        eventBus.dispatch('chat-delegate-token', { requestId: parentRequestId, sender: senderName, token: delta, sessionId })
      } else if (parentRequestId) {
        eventBus.dispatch('chat-token', { requestId: parentRequestId, text: delta, sessionId })
      }
    },
    onDone: (fullText, metadata) => {
      // Save session ID for resumption (persisted to disk)
      if (session.sessionId) {
        saveCCSession(ccSessionKey, session.sessionId)
      }
    },
    onError: (err) => {
      console.error(`[claude-code-sdk] error:`, err)
    }
  })

  try {
    const result = await session.send(message)

    if (parentRequestId && senderName) {
      eventBus.dispatch('chat-delegate-end', { requestId: parentRequestId, sender: senderName, sessionId })
    }

    console.log('[routeToCodingAgentSDK] Result length:', result?.length || 0)
    return result || 'Coding agent completed'
  } catch (err) {
    console.error('[routeToCodingAgentSDK] Error:', err)
    if (parentRequestId && senderName) {
      eventBus.dispatch('chat-delegate-end', { requestId: parentRequestId, sender: senderName, sessionId })
    }
    return `Error: ${err.message}`
  } finally {
    session.close()
  }
}

async function streamCodingAgent(agentId, prompt, { cwd, sessionId, requestId }, ctx) {
  ctx._activeRequestId = requestId
  ctx._activeCodingProcess = null

  // Resolve workspace identity for streaming events
  const _ccWs = workspaceRegistry.listWorkspaces()[0] || null
  const _ccIdent = { agentName: _ccWs?.identity?.name || agentId, avatar: _ccWs?.identity?.avatar || null, wsPath: _ccWs?.path || cwd, workspaceId: _ccWs?.id || null }

  ctx.pushStatus('running', `${agentId} working...`)
  eventBus.dispatch('chat-text-start', { requestId, ..._ccIdent, sessionId })

  try {
    const result = await codingAgents.run(agentId, prompt, {
      cwd,
      session: sessionId ? `paw-${sessionId}` : undefined,
      onOutput(chunk) {
        eventBus.dispatch('chat-token', { token: chunk, requestId })
      },
      onProcess(proc) {
        ctx._activeCodingProcess = proc
      },
    })

    ctx._activeCodingProcess = null
    ctx.pushStatus('idle', '')
    return { answer: result.stdout, mode: 'coding', agentId }
  } catch (err) {
    ctx._activeCodingProcess = null
    ctx.pushStatus('error', err.message?.slice(0, 80))
    throw err
  }
}

module.exports = { loadCCSessions, routeToCodingAgent, routeToCodingAgentSDK, streamCodingAgent }
