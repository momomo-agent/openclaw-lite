/**
 * core/ipc-workspaces.js — Workspace & Coding Agent IPC handlers
 *
 * Extracted from main.js (M36). CRUD + workspace management.
 */
const { ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

function registerWorkspaceHandlers({ workspaceRegistry, codingAgents, mainWindow }) {
  ipcMain.handle('workspaces-list', () => workspaceRegistry.listWorkspaces())

  ipcMain.handle('workspace-add', async (_, wsPath) => {
    const wsId = workspaceRegistry.addWorkspace(wsPath)
    return { id: wsId, path: wsPath, identity: workspaceRegistry.getWorkspace(wsId)?.identity }
  })

  ipcMain.handle('workspace-remove', (_, id) => {
    workspaceRegistry.removeWorkspace(id)
    return true
  })

  ipcMain.handle('workspace-create', async (_, { name, parentDir, avatar, description } = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose location for new workspace',
    })
    if (result.canceled || !result.filePaths[0]) return null
    const dir = result.filePaths[0]
    return workspaceRegistry.createWorkspace(dir, { name, avatar, description })
  })

  ipcMain.handle('workspace-update-identity', (_, { id, name, avatar, description }) => {
    workspaceRegistry.updateIdentity(id, { name, avatar, description })
    return workspaceRegistry.getWorkspace(id)
  })

  ipcMain.handle('workspace-set-avatar', async (_, { id, presetIndex, customPath }) => {
    if (presetIndex !== undefined) {
      workspaceRegistry.updateIdentity(id, { avatar: `preset:${presetIndex}` })
    } else if (customPath) {
      const ws = workspaceRegistry.getWorkspace(id)
      if (ws?.path) {
        const pawDir = path.join(ws.path, '.paw')
        fs.mkdirSync(pawDir, { recursive: true })
        const dest = path.join(pawDir, 'avatar.png')
        try { fs.copyFileSync(customPath, dest) } catch {}
        workspaceRegistry.updateIdentity(id, { avatar: dest })
      }
    }
    return workspaceRegistry.getWorkspace(id)
  })

  // Coding agents (workspace-based)
  ipcMain.handle('coding-agents-list', () => {
    const wsAgents = workspaceRegistry.listWorkspaces().filter(w => w.type === 'coding-agent')
    const available = codingAgents.listAvailable()
    return { workspaceAgents: wsAgents, available }
  })

  ipcMain.handle('workspace-add-coding-agent', async (_, { engine, projectPath }) => {
    const result = workspaceRegistry.addCodingAgent(engine, projectPath)
    return result
  })

  ipcMain.handle('coding-agent-add', async (_, { engine, projectPath, name }) => {
    return workspaceRegistry.addCodingAgent(engine, projectPath, name)
  })

  ipcMain.handle('coding-agent-delete', (_, id) => {
    workspaceRegistry.removeWorkspace(id)
  })
}

module.exports = { registerWorkspaceHandlers }
