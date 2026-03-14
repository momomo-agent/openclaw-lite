// tools/screen-capture.js — On-demand screen capture for visual context
// Philosophy: capture when the user asks, not continuously.
// Hides Paw briefly to get a clean screenshot of what's behind it.
const { registerTool } = require('./registry')

registerTool({
  name: 'screen_capture',
  description: 'Capture a screenshot of the user\'s screen (all windows, Paw hidden). Use when the user wants you to see what\'s on their screen — "look at my screen", "what do you see", "check this", "help me with this". Paw hides briefly (~300ms) to capture cleanly.',
  input_schema: {
    type: 'object',
    properties: {},
  },
  handler: async (_, { clawDir }) => {
    try {
      if (!global._pawCaptureScreen) {
        return { error: 'Screen capture not available.' }
      }

      const capture = await global._pawCaptureScreen()
      if (!capture) {
        return { error: 'Screenshot failed. Screen recording permission may be needed (System Settings > Privacy & Security > Screen & System Audio Recording).' }
      }

      return {
        result: `Full screen screenshot (${capture.width}×${capture.height})`,
        image: { type: 'base64', media_type: 'image/png', data: capture.data },
      }
    } catch (err) {
      return { error: `Screenshot failed: ${err.message}` }
    }
  },
})
