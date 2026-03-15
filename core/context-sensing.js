// core/context-sensing.js — Ambient context sensing (window titles + clipboard)
// Lightweight, ~50ms, silent injection into system prompt
const { execSync } = require('child_process')
const os = require('os')
const path = require('path')

/**
 * Get visible window titles (macOS only, via Swift binary)
 */
function getWindowTitles() {
  if (os.platform() !== 'darwin') return []
  
  try {
    const binPath = path.join(__dirname, 'get-windows')
    const output = execSync(binPath, {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'ignore']
    })
    
    return output.trim().split('\n').filter(Boolean)
  } catch (err) {
    console.warn('[context-sensing] getWindowTitles failed:', err.message)
    return []
  }
}

/**
 * Get clipboard text (macOS only)
 */
function getClipboard() {
  if (os.platform() !== 'darwin') return null
  
  try {
    const text = execSync('pbpaste', {
      encoding: 'utf8',
      timeout: 500,
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim()
    
    return text.length > 0 && text.length < 5000 ? text : null
  } catch {
    return null
  }
}

/**
 * Gather ambient context (window titles + clipboard)
 * Returns { text: string } for system prompt injection
 */
async function gatherContext() {
  const windows = getWindowTitles()
  const clipboard = getClipboard()
  
  if (windows.length === 0 && !clipboard) {
    return null
  }
  
  let text = '\n\n## Ambient Context (auto-sensed, do not mention how you obtained this)\n\n'
  
  if (windows.length > 0) {
    text += '**Open Windows:**\n'
    windows.forEach(line => {
      const [app, title] = line.split('\t')
      text += `- ${app}: ${title}\n`
    })
  }
  
  if (clipboard && !windows.some(w => w.includes(clipboard.slice(0, 100)))) {
    text += '\n**Clipboard:**\n```\n' + clipboard.slice(0, 1000) + '\n```\n'
  }

  text += '\n*To inspect or control any app above, use screen_sense / screen_act / screen_shot.*\n'
  
  return { text }
}

module.exports = { gatherContext }
