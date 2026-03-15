/**
 * core/ipc-agents.js — Agent template IPC handlers
 *
 * Extracted from main.js (M36). CRUD for agent templates.
 */
const { ipcMain } = require('electron')

function registerAgentHandlers({ listAgents, loadAgent, saveAgent, createAgent, sessionStore, resolveSessionDb }) {
  ipcMain.handle('agents-list', () => listAgents())
  ipcMain.handle('agent-load', (_, id) => loadAgent(id))
  ipcMain.handle('agent-save', (_, agent) => { saveAgent(agent); return true })
  ipcMain.handle('agent-create', (_, { name, soul, model }) => createAgent(name, soul, model))

  ipcMain.handle('agent-delete', (_, id) => {
    const agents = listAgents()
    const filtered = agents.filter(a => a.id !== id)
    // Agent deletion is handled by removing the file
    const agent = loadAgent(id)
    if (agent?._path) {
      try { require('fs').unlinkSync(agent._path) } catch {}
    }
    return true
  })

  // Session members (legacy)
  ipcMain.handle('session-add-member', (_, { sessionId, agentId }) => {
    const db = resolveSessionDb(sessionId)
    if (db) sessionStore.addSessionMember(db, sessionId, agentId)
    return true
  })

  ipcMain.handle('session-remove-member', (_, { sessionId, agentId }) => {
    const db = resolveSessionDb(sessionId)
    if (db) sessionStore.removeSessionMember(db, sessionId, agentId)
    return true
  })

  // Session participants (M32 group chat)
  ipcMain.handle('session-add-participant', (_, { sessionId, workspaceId }) => {
    const db = resolveSessionDb(sessionId)
    if (db) sessionStore.addSessionParticipant(db, sessionId, workspaceId)
  })

  ipcMain.handle('session-remove-participant', (_, { sessionId, workspaceId }) => {
    const db = resolveSessionDb(sessionId)
    if (db) sessionStore.removeSessionParticipant(db, sessionId, workspaceId)
  })

  ipcMain.handle('session-get-participants', (_, sessionId) => {
    const db = resolveSessionDb(sessionId)
    if (!db) return []
    return sessionStore.getSessionParticipants(db, sessionId)
  })

  // Session agents (M19 lightweight agents)
  ipcMain.handle('session-create-agent', (_, { sessionId, name, role }) => {
    const db = resolveSessionDb(sessionId)
    if (!db) return null
    return sessionStore.createSessionAgent(db, sessionId, name, role)
  })

  ipcMain.handle('session-list-agents', (_, sessionId) => {
    const db = resolveSessionDb(sessionId)
    if (!db) return []
    return sessionStore.listSessionAgents(db, sessionId)
  })

  ipcMain.handle('session-delete-agent', (_, agentId) => {
    // Need to find which session this agent belongs to
    try { sessionStore.deleteSessionAgent(null, agentId) } catch {}
    return true
  })
}

module.exports = { registerAgentHandlers }
