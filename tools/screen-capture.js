// tools/screen-capture.js — Explicit screen capture tool
// For when the user explicitly asks to see their screen, or AI needs visual context.
// Ambient sensing (window titles + clipboard) is handled by core/context-sensing.js
const { registerTool } = require('./registry')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { execFile } = require('child_process')
const { BrowserWindow } = require('electron')

registerTool({
  name: 'screen_capture',
  description: 'Take a screenshot of the user\'s full screen. Hides Paw briefly to capture what\'s behind it. Use when you need to SEE the screen (UI issues, design review, visual debugging). Note: you already have window titles from ambient context — only capture if visual information is truly needed.',
  input_schema: {
    type: 'object',
    properties: {},
  },
  handler: async () => {
    try {
      const mainWindow = BrowserWindow.getAllWindows().find(w => w.getTitle() === 'Paw') || BrowserWindow.getAllWindows()[0]
      const wasVisible = mainWindow?.isVisible()
      if (wasVisible) mainWindow.hide()

      const capture = await new Promise((resolve) => {
        setTimeout(() => {
          const tmpFile = path.join(os.tmpdir(), `paw-capture-${Date.now()}.png`)
          execFile('/usr/sbin/screencapture', ['-x', '-C', tmpFile], (err) => {
            if (wasVisible) mainWindow.show()
            if (err) return resolve(null)
            try {
              const buf = fs.readFileSync(tmpFile)
              fs.unlinkSync(tmpFile)
              resolve(buf.toString('base64'))
            } catch { resolve(null) }
          })
        }, 200)
      })

      if (!capture) {
        return { error: 'Screenshot failed. Screen recording permission may be needed (System Settings > Privacy & Security > Screen & System Audio Recording).' }
      }

      return {
        result: 'Full screen screenshot captured.',
        image: { type: 'base64', media_type: 'image/png', data: capture },
      }
    } catch (err) {
      return { error: `Screenshot failed: ${err.message}` }
    }
  },
})
