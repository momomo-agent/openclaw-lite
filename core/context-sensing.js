// core/context-sensing.js — Silent context gathering before each message
// Philosophy: lightweight signals that tell AI what the user is working on.
// No screenshots by default — window titles + clipboard are enough.

const { clipboard } = require('electron')
const { execFile } = require('child_process')

let _lastClipboard = ''  // deduplicate clipboard across messages

/**
 * Gather ambient context right before sending a message.
 * Returns { text: string } or null.
 * Lightweight: no screenshots, no file I/O. ~50ms total.
 */
async function gatherContext() {
  const parts = []

  // 1. Window list — titles tell us what the user has open
  try {
    const windows = await getVisibleWindows()
    if (windows.length > 0) {
      parts.push('[Open Windows]\n' + windows.map(w => `- ${w.app}: ${w.title}`).join('\n'))
    }
  } catch {}

  // 2. Clipboard — what the user just copied
  try {
    const text = clipboard.readText()?.trim()
    if (text && text !== _lastClipboard && text.length > 0 && text.length < 5000) {
      parts.push(`[Clipboard]\n${text.slice(0, 1500)}`)
      _lastClipboard = text
    }
  } catch {}

  if (parts.length === 0) return null

  return {
    text: `\n\n---\n\n## Ambient Context (auto-sensed, do not mention how you obtained this)\n${parts.join('\n\n')}`,
  }
}

/**
 * Get visible windows with titles via macOS CGWindowListCopyWindowInfo.
 * Returns [{ app, title }] — frontmost first, Paw excluded.
 */
function getVisibleWindows() {
  return new Promise((resolve) => {
    // JXA script: get visible windows with owner + title, ordered by layer
    const script = `
      ObjC.import('CoreGraphics');
      ObjC.import('Foundation');
      const list = $.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements, $.kCGNullWindowID);
      const count = $.CFArrayGetCount(list);
      const results = [];
      const seen = new Set();
      for (let i = 0; i < count; i++) {
        const info = $.CFArrayGetValueAtIndex(list, i);
        const owner = ObjC.deepUnwrap($.CFDictionaryGetValue(info, $("kCGWindowOwnerName")));
        const name = ObjC.deepUnwrap($.CFDictionaryGetValue(info, $("kCGWindowName")));
        const layer = ObjC.deepUnwrap($.CFDictionaryGetValue(info, $("kCGWindowLayer")));
        if (layer !== 0) continue;
        if (!name || name.length === 0) continue;
        if (owner === "Paw" || owner === "Electron") continue;
        if (owner === "Window Server" || owner === "SystemUIServer") continue;
        const key = owner + ":" + name;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(owner + "\\t" + name);
        if (results.length >= 15) break;
      }
      results.join("\\n");
    `

    execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script], { timeout: 2000 }, (err, stdout) => {
      if (err || !stdout?.trim()) return resolve([])
      const windows = stdout.trim().split('\n').map(line => {
        const [app, ...rest] = line.split('\t')
        return { app, title: rest.join('\t') }
      }).filter(w => w.title)
      resolve(windows)
    })
  })
}

module.exports = { gatherContext }
