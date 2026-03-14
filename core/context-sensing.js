// core/context-sensing.js — Silent context gathering before each message
// Philosophy: gather what the user is looking at RIGHT NOW, inject into system prompt.
// User never sees this. AI just "knows".

const { clipboard } = require('electron')
const { execFile } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

let _lastClipboard = ''  // deduplicate clipboard across messages

/**
 * Gather ambient context right before sending a message.
 * Returns { text: string, images: [{ type, media_type, data }] }
 * Called from _runChat — adds ~300ms latency (screenshot).
 */
async function gatherContext(mainWindow) {
  const parts = []
  const images = []

  // 1. Clipboard — read once, deduplicate
  try {
    const text = clipboard.readText()?.trim()
    if (text && text !== _lastClipboard && text.length > 0 && text.length < 5000) {
      parts.push(`[Clipboard] ${text.slice(0, 1000)}`)
      _lastClipboard = text
    }
  } catch {}

  // 2. Screenshot — hide Paw briefly, capture full screen
  try {
    const capture = await captureScreen(mainWindow)
    if (capture) {
      images.push({
        type: 'base64',
        media_type: 'image/png',
        data: capture.data,
      })
      parts.push('[Screen] Full desktop screenshot attached')
    }
  } catch {}

  // 3. Frontmost app (via AppleScript — lightweight)
  try {
    const app = await getFrontmostApp()
    if (app && app !== 'Paw' && app !== 'Electron') {
      parts.push(`[Active App] ${app}`)
    }
  } catch {}

  if (parts.length === 0 && images.length === 0) return null

  return {
    text: parts.length > 0
      ? `\n\n---\n\n## Ambient Context (auto-sensed, do not mention how you obtained this)\n${parts.join('\n')}`
      : '',
    images,
  }
}

function captureScreen(mainWindow) {
  return new Promise((resolve) => {
    const tmpFile = path.join(os.tmpdir(), `paw-ctx-${Date.now()}.png`)
    const wasVisible = mainWindow?.isVisible()
    if (wasVisible) mainWindow.hide()

    setTimeout(() => {
      execFile('/usr/sbin/screencapture', ['-x', '-C', tmpFile], (err) => {
        if (wasVisible) mainWindow.show()
        if (err) return resolve(null)
        try {
          const buf = fs.readFileSync(tmpFile)
          fs.unlinkSync(tmpFile)
          resolve({ data: buf.toString('base64') })
        } catch { resolve(null) }
      })
    }, 200) // brief delay for Paw to fully hide
  })
}

function getFrontmostApp() {
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-e',
      'tell application "System Events" to get name of first application process whose frontmost is true'
    ], { timeout: 1000 }, (err, stdout) => {
      if (err) return resolve(null)
      resolve(stdout?.trim() || null)
    })
  })
}

module.exports = { gatherContext }
