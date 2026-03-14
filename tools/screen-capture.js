// tools/screen-capture.js — Explicit screen capture tool
// For when the user explicitly asks to see their screen.
// Ambient sensing (silent) is handled by core/context-sensing.js
const { registerTool } = require('./registry')

registerTool({
  name: 'screen_capture',
  description: 'Take a fresh screenshot of the user\'s full screen. Note: ambient context already includes a screenshot — only use this tool if you need a NEW capture (e.g. user made changes and wants you to look again).',
  input_schema: {
    type: 'object',
    properties: {},
  },
  handler: async () => {
    try {
      const { gatherContext } = require('../core/context-sensing')
      const { BrowserWindow } = require('electron')
      const mainWindow = BrowserWindow.getAllWindows().find(w => w.getTitle() === 'Paw') || BrowserWindow.getAllWindows()[0]
      const ctx = await gatherContext(mainWindow)
      if (ctx?.images?.[0]) {
        return {
          result: 'Fresh full screen screenshot captured.',
          image: ctx.images[0],
        }
      }
      return { error: 'Screenshot failed. Screen recording permission may be needed.' }
    } catch (err) {
      return { error: `Screenshot failed: ${err.message}` }
    }
  },
})
