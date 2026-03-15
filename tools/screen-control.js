// tools/screen-control.js — See and control any app on the user's Mac
//
// Three tools in one:
//   screen_sense  — snapshot an app's UI elements (what's clickable, what's showing)
//   screen_act    — click, type, press keys, drag, scroll
//   screen_shot   — take a screenshot of an app or the full screen
//
// Powered by agent-control's macOS Accessibility driver.
// Unlike screen_capture (screencapture binary), this uses the AX API
// which doesn't require Screen Recording permission for element discovery.

const { registerTool } = require('./registry')
const { execFile, execFileSync } = require('child_process')
const { BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

// ── Driver binary ──

// Locate the agent-control macOS driver binary.
// Priority: bundled in app → global install → npm global
function findDriver() {
  const candidates = [
    path.join(__dirname, '..', 'bin', 'agent-control'),         // bundled
    '/usr/local/bin/agent-control-macos',                        // global
  ]

  // Try to find via npm global (agent-control package includes macos-driver)
  try {
    const npmGlobal = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', timeout: 3000 }).trim()
    const acPath = path.join(npmGlobal, 'agent-control', 'macos-driver', '.build', 'release', 'agent-control')
    candidates.push(acPath)
    // Also try debug build
    candidates.push(acPath.replace('/release/', '/debug/'))
    // Also try the common local dev path
    candidates.push(path.join(os.homedir(), 'LOCAL', 'momo-agent', 'tools', 'agent-control', 'macos-driver', '.build', 'arm64-apple-macosx', 'debug', 'agent-control'))
  } catch {}

  for (const p of candidates) {
    try {
      fs.accessSync(p, fs.constants.X_OK)
      return p
    } catch {}
  }
  return null
}

let _driverPath = null
function getDriver() {
  if (!_driverPath) _driverPath = findDriver()
  return _driverPath
}

// ── Helpers ──

function resolveAppTarget(target) {
  // Accept app name, PID, or bundle ID
  if (!target) return []
  if (/^\d+$/.test(target)) return ['--pid', target]
  return ['--app', target]
}

function runDriver(args, timeoutMs = 10000) {
  const driver = getDriver()
  if (!driver) {
    return { ok: false, error: 'agent-control macOS driver not found. Install: npm i -g agent-control' }
  }

  return new Promise((resolve) => {
    execFile(driver, args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ ok: false, error: stderr || err.message })
        return
      }
      try {
        resolve({ ok: true, data: JSON.parse(stdout) })
      } catch {
        resolve({ ok: true, raw: stdout.trim() })
      }
    })
  })
}

// ── screen_sense ──

registerTool({
  name: 'screen_sense',
  description: `See another app's UI: buttons, text fields, links, tabs — everything interactive.
Returns a list of elements with @refs you can target with screen_act.
Use this when the user asks about what's on screen, or before you click/type in an app.

Examples:
  screen_sense({ app: "Chrome" })         → see Chrome's UI elements
  screen_sense({ app: "Finder" })         → see Finder's file list
  screen_sense({})                        → see the frontmost app`,
  parameters: {
    type: 'object',
    properties: {
      app: {
        type: 'string',
        description: 'App name (e.g. "Chrome", "Finder"), PID, or bundle ID. Omit for frontmost app.'
      }
    }
  },
  handler: async (args) => {
    const appArgs = resolveAppTarget(args.app)
    const result = await runDriver(['snapshot', '-i', ...appArgs])

    if (!result.ok) return result.error

    const elements = result.data
    if (!elements || elements.length === 0) {
      return 'No interactive elements found. Is the app running and visible?'
    }

    // Format for LLM: compact, scannable
    const lines = []
    const roleGroups = {}

    for (const el of elements) {
      const role = el.role || '?'
      roleGroups[role] = (roleGroups[role] || 0) + 1

      // Only show elements with useful labels or values
      const label = el.label || ''
      const value = el.value || ''
      const display = label || value || ''
      if (display || ['TextField', 'TextArea', 'Button', 'Link', 'Tab', 'RadioButton', 'CheckBox', 'PopUpButton'].includes(role)) {
        const valSuffix = value && value !== label ? ` val="${value.slice(0, 60)}"` : ''
        lines.push(`${el.ref}  ${role}  ${display.slice(0, 80)}${valSuffix}`)
      }
    }

    // Summary header
    const summary = Object.entries(roleGroups)
      .sort((a, b) => b[1] - a[1])
      .map(([r, c]) => `${c}×${r}`)
      .join(', ')

    return `${elements.length} elements (${summary})\n\n${lines.join('\n')}`
  }
})

// ── screen_act ──

registerTool({
  name: 'screen_act',
  description: `Interact with another app: click buttons, type text, press keys, drag, scroll.
Use @refs from screen_sense to target elements.

Actions:
  click @ref           — click an element
  fill @ref "text"     — clear a field and type text
  press key            — press a key (Enter, Tab, Escape, cmd+c, etc.)
  drag @from @to       — drag between elements
  scroll up|down [amt] — scroll (default 100px)

Examples:
  screen_act({ action: "click", ref: "@e5" })
  screen_act({ action: "fill", ref: "@e3", text: "hello world" })
  screen_act({ action: "press", key: "cmd+w" })
  screen_act({ action: "click", ref: "@e5", app: "Chrome" })`,
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['click', 'fill', 'press', 'drag', 'scroll'],
        description: 'What to do'
      },
      ref: { type: 'string', description: '@ref from screen_sense (for click/fill)' },
      text: { type: 'string', description: 'Text to type (for fill)' },
      key: { type: 'string', description: 'Key to press (for press): Enter, Tab, Escape, cmd+c, etc.' },
      from_ref: { type: 'string', description: 'Drag start @ref' },
      to_ref: { type: 'string', description: 'Drag end @ref' },
      direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction' },
      amount: { type: 'number', description: 'Scroll amount in pixels (default 100)' },
      app: { type: 'string', description: 'Target app (name/PID). Needed if acting on a non-frontmost app.' }
    },
    required: ['action']
  },
  handler: async (args, context) => {
    const appArgs = resolveAppTarget(args.app)
    let driverArgs = []

    switch (args.action) {
      case 'click':
        if (!args.ref) return 'Error: ref required for click (e.g. @e5)'
        driverArgs = ['click', args.ref, ...appArgs]
        break

      case 'fill':
        if (!args.ref) return 'Error: ref required for fill'
        if (args.text == null) return 'Error: text required for fill'
        driverArgs = ['fill', args.ref, args.text, ...appArgs]
        break

      case 'press':
        if (!args.key) return 'Error: key required for press'
        driverArgs = ['press', args.key]
        break

      case 'drag':
        if (!args.from_ref || !args.to_ref) return 'Error: from_ref and to_ref required for drag'
        driverArgs = ['drag', args.from_ref, args.to_ref, ...appArgs]
        break

      case 'scroll':
        driverArgs = ['scroll', args.direction || 'down', String(args.amount || 100)]
        break

      default:
        return `Unknown action: ${args.action}`
    }

    const result = await runDriver(driverArgs)
    if (!result.ok) return `Action failed: ${result.error}`

    const data = result.data || result.raw
    if (data?.ok === false) return `Action failed: ${data.error || 'unknown error'}`

    return `Done: ${args.action} ${args.ref || args.key || args.direction || ''}`
  }
})

// ── screen_shot ──
// Upgrade: can now target a specific app or element (via agent-control screenshot)

registerTool({
  name: 'screen_shot',
  description: `Take a screenshot. Can capture the full screen, a specific app window, or a specific UI element.
Returns the image for visual analysis. Use this to verify what happened after screen_act,
or when you need to SEE something (design review, visual debugging, reading content).

Examples:
  screen_shot({})                              → full screen
  screen_shot({ app: "Chrome" })               → Chrome window only
  screen_shot({ app: "Finder", ref: "@e3" })   → specific element in Finder`,
  parameters: {
    type: 'object',
    properties: {
      app: { type: 'string', description: 'App to screenshot (name/PID). Omit for full screen.' },
      ref: { type: 'string', description: '@ref to screenshot a specific element' }
    }
  },
  handler: async (args) => {
    const tmpFile = path.join(os.tmpdir(), `paw-shot-${Date.now()}.png`)

    try {
      if (!args.app && !args.ref) {
        // Full screen: use screencapture (hides Paw first)
        const mainWindow = BrowserWindow.getAllWindows().find(w => w.getTitle() === 'Paw') || BrowserWindow.getAllWindows()[0]
        const wasVisible = mainWindow?.isVisible()
        if (wasVisible) mainWindow.hide()

        const capture = await new Promise((resolve) => {
          setTimeout(() => {
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

        if (!capture) return { error: 'Screenshot failed. Screen recording permission may be needed.' }
        return {
          result: 'Full screen captured.',
          image: { type: 'base64', media_type: 'image/png', data: capture }
        }
      }

      // App or element screenshot via agent-control
      const driver = getDriver()
      if (!driver) return { error: 'agent-control macOS driver not found.' }

      const driverArgs = ['screenshot', tmpFile]
      if (args.ref) driverArgs.splice(1, 0, args.ref) // screenshot @ref path
      driverArgs.push(...resolveAppTarget(args.app))

      const result = await runDriver(driverArgs, 15000)
      if (!result.ok) return { error: `Screenshot failed: ${result.error}` }

      // Read the image
      try {
        const buf = fs.readFileSync(tmpFile)
        fs.unlinkSync(tmpFile)
        return {
          result: `Screenshot captured${args.app ? ` (${args.app})` : ''}${args.ref ? ` element ${args.ref}` : ''}.`,
          image: { type: 'base64', media_type: 'image/png', data: buf.toString('base64') }
        }
      } catch (e) {
        return { error: `Failed to read screenshot: ${e.message}` }
      }
    } catch (err) {
      try { fs.unlinkSync(tmpFile) } catch {}
      return { error: `Screenshot failed: ${err.message}` }
    }
  }
})
