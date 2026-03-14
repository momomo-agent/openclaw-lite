// tools/screen-capture.js — Capture screen/window for visual context
const { BrowserWindow, desktopCapturer } = require('electron')
const { registerTool } = require('./registry')
const fs = require('fs')
const path = require('path')

registerTool({
  name: 'screen_capture',
  description: 'Capture a screenshot of the screen or a specific window. Returns the image for visual analysis. Use when the user wants you to see what\'s on their screen, analyze a visual, or when they say things like "look at my screen", "what do you see", "check this", "help me with this".',
  input_schema: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description: '"previous" uses the auto-captured window from when user switched to Paw (instant, no permission prompt). "screen" captures the full screen (may need permission).',
        enum: ['screen', 'previous'],
        default: 'previous',
      },
    },
  },
  handler: async ({ target = 'previous' }, { clawDir }) => {
    try {
      // Try cached capture first (auto-captured on Paw focus)
      if (target === 'previous' && global._pawGetLastCapture) {
        const cached = global._pawGetLastCapture()
        if (cached && (Date.now() - cached.timestamp) < 60000) { // fresh within 60s
          return {
            result: `Screenshot of "${cached.windowName}" (${cached.width}×${cached.height}, auto-captured when you switched to Paw)`,
            image: { type: 'base64', media_type: 'image/png', data: cached.data },
          }
        }
      }

      // Live capture
      const sources = await desktopCapturer.getSources({
        types: target === 'screen' ? ['screen'] : ['screen', 'window'],
        thumbnailSize: { width: 1920, height: 1080 },
      })

      let source
      if (target === 'screen') {
        source = sources.find(s => s.id.startsWith('screen:'))
      } else {
        const pawWindows = BrowserWindow.getAllWindows().map(w => w.getTitle())
        source = sources.find(s =>
          !s.id.startsWith('screen:') &&
          !pawWindows.some(t => s.name.includes(t)) &&
          s.name !== 'Paw' &&
          s.name.trim().length > 0
        ) || sources.find(s => s.id.startsWith('screen:'))
      }

      if (!source) {
        return { error: 'No capture source found. Screen recording permission may be needed (System Settings > Privacy & Security > Screen & System Audio Recording).' }
      }

      const thumbnail = source.thumbnail
      if (!thumbnail || thumbnail.isEmpty()) {
        return { error: 'Captured empty image. Grant screen recording permission in System Settings > Privacy & Security.' }
      }

      const base64 = thumbnail.toPNG().toString('base64')
      const size = thumbnail.getSize()

      return {
        result: `Screenshot of "${source.name}" (${size.width}×${size.height})`,
        image: { type: 'base64', media_type: 'image/png', data: base64 },
      }
    } catch (err) {
      return { error: `Screenshot failed: ${err.message}` }
    }
  },
})
