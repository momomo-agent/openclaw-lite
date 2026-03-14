// tools/screen-capture.js — Capture screen for visual context
const { registerTool } = require('./registry')

registerTool({
  name: 'screen_capture',
  description: 'Capture a screenshot of the full screen (all windows). Returns the image for visual analysis. Use when the user wants you to see what\'s on their screen, analyze a visual, or when they say things like "look at my screen", "what do you see", "check this", "help me with this".',
  input_schema: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description: '"previous" uses the auto-captured full screen from when user last left Paw (instant). "screen" does a live full-screen capture.',
        enum: ['screen', 'previous'],
        default: 'previous',
      },
    },
  },
  handler: async ({ target = 'previous' }, { clawDir }) => {
    try {
      // Try cached capture first (auto-captured on Paw blur)
      if (target === 'previous' && global._pawGetLastCapture) {
        const cached = global._pawGetLastCapture()
        if (cached && (Date.now() - cached.timestamp) < 60000) { // fresh within 60s
          return {
            result: `Screenshot of "${cached.windowName}" (${cached.width}×${cached.height}, auto-captured when you left Paw)`,
            image: { type: 'base64', media_type: 'image/png', data: cached.data },
          }
        }
      }

      // Live capture — full screen via screencapture CLI (no Electron permission prompt)
      const tmpFile = require('path').join(require('os').tmpdir(), `paw-live-${Date.now()}.png`)
      const { execFileSync } = require('child_process')
      try {
        execFileSync('/usr/sbin/screencapture', ['-x', '-C', tmpFile], { timeout: 5000 })
      } catch {
        return { error: 'Screenshot failed. Screen recording permission may be needed (System Settings > Privacy & Security > Screen & System Audio Recording).' }
      }

      const fs = require('fs')
      if (!fs.existsSync(tmpFile)) {
        return { error: 'No capture file created. Grant screen recording permission in System Settings > Privacy & Security.' }
      }

      const buf = fs.readFileSync(tmpFile)
      fs.unlinkSync(tmpFile)
      const base64 = buf.toString('base64')

      return {
        result: `Full screen screenshot (live capture)`,
        image: { type: 'base64', media_type: 'image/png', data: base64 },
      }
    } catch (err) {
      return { error: `Screenshot failed: ${err.message}` }
    }
  },
})
