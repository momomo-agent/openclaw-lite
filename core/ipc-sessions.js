/**
 * core/ipc-sessions.js — Session & Message IPC handlers
 *
 * Extracted from main.js (M36). Pure CRUD, no business logic.
 */
const { ipcMain } = require('electron')

function registerSessionHandlers({ sessionStore, resolveSessionDb, listSessions, loadSession, saveSession }) {
  ipcMain.handle('sessions-list', (_, opts) => listSessions(opts))
  ipcMain.handle('session-load', (_, id) => loadSession(id))
  ipcMain.handle('session-save', (_, session) => { saveSession(session); return true })

  ipcMain.handle('session-create', (_, opts) => {
    const db = resolveSessionDb(opts?.workspaceId || null)
    return sessionStore.createSession(db, opts?.title, opts?.mode, opts?.model)
  })

  ipcMain.handle('session-delete', (_, id) => {
    const db = resolveSessionDb(id)
    if (db) sessionStore.deleteSession(db, id)
  })

  ipcMain.handle('session-rename', (_, id, title) => {
    const db = resolveSessionDb(id)
    if (db) sessionStore.renameSession(db, id, title)
    return true
  })

  ipcMain.handle('message-delete', (_, { sessionId, messageId }) => {
    const db = resolveSessionDb(sessionId)
    if (db) sessionStore.deleteMessage(db, sessionId, messageId)
  })

  ipcMain.handle('message-update-meta', (_, { sessionId, messageId, fields }) => {
    const db = resolveSessionDb(sessionId)
    if (db) sessionStore.updateMessageMeta(db, sessionId, messageId, fields)
  })

  ipcMain.handle('session-export', (_, id) => {
    const db = resolveSessionDb(id)
    if (!db) return null
    return sessionStore.loadSession(db, id)
  })

  ipcMain.handle('session-tasks', (_, sessionId) => {
    const db = resolveSessionDb(sessionId)
    if (!db) return []
    try { return sessionStore.getSessionTasks(db, sessionId) } catch { return [] }
  })
}

module.exports = { registerSessionHandlers }
