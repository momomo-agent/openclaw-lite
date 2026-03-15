/**
 * core/ipc-files.js — File/Shell/Export IPC handlers
 *
 * Extracted from main.js (M36).
 */
const { ipcMain, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

function registerFileHandlers({ getClawDir, mainWindow }) {
  ipcMain.handle('open-claw-dir', () => {
    const dir = getClawDir()
    if (dir) shell.openPath(dir)
  })

  ipcMain.handle('open-file', (_, filePath) => {
    if (filePath && fs.existsSync(filePath)) shell.openPath(filePath)
    return true
  })

  ipcMain.handle('open-file-preview', (_, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
      const win = mainWindow
      if (win) win.previewFile(filePath)
    }
    return true
  })

  ipcMain.handle('open-external', (_, url) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      shell.openExternal(url)
    }
    return true
  })

  ipcMain.handle('read-file', (_, filePath) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) return null
      return fs.readFileSync(filePath, 'utf8')
    } catch { return null }
  })

  ipcMain.handle('write-export', (_, filename, content) => {
    const dir = getClawDir()
    if (!dir) return null
    const exportDir = path.join(dir, 'exports')
    fs.mkdirSync(exportDir, { recursive: true })
    const p = path.join(exportDir, filename)
    fs.writeFileSync(p, content, 'utf8')
    return p
  })
}

module.exports = { registerFileHandlers }
