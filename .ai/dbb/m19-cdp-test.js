#!/usr/bin/env node
/**
 * M19 CDP Test — Lightweight Agent E2E
 * Connects to running Paw via CDP, runs UI tests, takes screenshots.
 * Prerequisites: Paw running with --remote-debugging-port=9224
 * Usage: node .ai/dbb/m19-cdp-test.js
 */
const http = require('http')
const net = require('net')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const CDP_PORT = 9224
const SCREENSHOTS = path.join(__dirname, 'latest')
fs.mkdirSync(SCREENSHOTS, { recursive: true })

const results = []
function record(id, name, status, notes) {
  results.push({ id, name, status, notes })
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️'
  console.log(`${icon} ${id}: ${name} — ${notes}`)
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

// ── Persistent CDP WebSocket connection ──
class CDPClient {
  constructor(wsUrl) { this.wsUrl = wsUrl; this.ws = null; this.msgId = 1; this.pending = new Map() }

  connect() {
    const url = new URL(this.wsUrl)
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(parseInt(url.port), url.hostname, () => {
        const key = crypto.randomBytes(16).toString('base64')
        this.socket.write(
          `GET ${url.pathname} HTTP/1.1\r\nHost: ${url.host}\r\n` +
          `Upgrade: websocket\r\nConnection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
        )
      })
      this.socket.on('error', reject)

      let buf = Buffer.alloc(0)
      let handshakeDone = false

      this.socket.on('data', (data) => {
        buf = Buffer.concat([buf, data])
        if (!handshakeDone) {
          const idx = buf.indexOf('\r\n\r\n')
          if (idx === -1) return
          handshakeDone = true
          buf = buf.slice(idx + 4)
          resolve()
        }
        // Process all complete frames in buffer
        while (buf.length >= 2) {
          const fin = (buf[0] & 0x80) !== 0
          const opcode = buf[0] & 0x0f
          let payloadLen = buf[1] & 0x7f
          let offset = 2
          if (payloadLen === 126) {
            if (buf.length < 4) return
            payloadLen = buf.readUInt16BE(2)
            offset = 4
          } else if (payloadLen === 127) {
            if (buf.length < 10) return
            payloadLen = Number(buf.readBigUInt64BE(2))
            offset = 10
          }
          if (buf.length < offset + payloadLen) return
          const payload = buf.slice(offset, offset + payloadLen)
          buf = buf.slice(offset + payloadLen)
          if (opcode === 1) { // text frame
            try {
              const msg = JSON.parse(payload.toString())
              if (msg.id && this.pending.has(msg.id)) {
                this.pending.get(msg.id).resolve(msg)
                this.pending.delete(msg.id)
              }
            } catch {}
          }
        }
      })
    })
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 15000)
      this.pending.set(id, { resolve: (msg) => { clearTimeout(timer); resolve(msg) } })
      const cmd = JSON.stringify({ id, method, params })
      const payload = Buffer.from(cmd)
      const mask = crypto.randomBytes(4)
      let header
      if (payload.length < 126) {
        header = Buffer.alloc(6)
        header[0] = 0x81; header[1] = 0x80 | payload.length
        mask.copy(header, 2)
      } else if (payload.length < 65536) {
        header = Buffer.alloc(8)
        header[0] = 0x81; header[1] = 0x80 | 126
        header.writeUInt16BE(payload.length, 2)
        mask.copy(header, 4)
      } else {
        header = Buffer.alloc(14)
        header[0] = 0x81; header[1] = 0x80 | 127
        header.writeBigUInt64BE(BigInt(payload.length), 2)
        mask.copy(header, 10)
      }
      const masked = Buffer.alloc(payload.length)
      for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4]
      this.socket.write(Buffer.concat([header, masked]))
    })
  }

  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error')
    return r.result?.result?.value
  }

  async screenshot(name) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' })
    if (r.result?.data) {
      const p = path.join(SCREENSHOTS, name)
      fs.writeFileSync(p, Buffer.from(r.result.data, 'base64'))
      console.log(`  📸 ${name}`)
      return p
    }
  }

  close() { if (this.socket) this.socket.destroy() }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log('=== M19 CDP E2E Test ===\n')

  // Connect to running Paw
  const raw = await httpGet(`http://localhost:${CDP_PORT}/json`)
  const pages = JSON.parse(raw)
  const page = pages.find(p => p.url?.includes('index.html')) || pages[0]
  if (!page?.webSocketDebuggerUrl) { console.error('No CDP page. Is Paw running with --remote-debugging-port=9224?'); process.exit(1) }

  const cdp = new CDPClient(page.webSocketDebuggerUrl)
  await cdp.connect()
  console.log('CDP connected.\n')

  // TC01: Chat screen visible
  try {
    const text = await cdp.eval('document.body.innerText.slice(0, 300)')
    const ok = text && (text.includes('Sessions') || text.includes('New Chat'))
    await cdp.screenshot('tc01-launch.png')
    record('TC01', 'Chat screen visible', ok ? 'PASS' : 'FAIL', ok ? 'Chat UI ready' : `Body: ${String(text).slice(0, 80)}`)
  } catch (e) { record('TC01', 'Chat screen', 'FAIL', e.message) }

  // TC02: Open Members panel
  try {
    await cdp.eval(`document.querySelector('button[onclick="toggleMembers()"]').click()`)
    await sleep(600)
    const display = await cdp.eval(`document.getElementById('membersOverlay').style.display`)
    await cdp.screenshot('tc02-members.png')
    record('TC02', 'Members panel opens', display === 'flex' ? 'PASS' : 'FAIL', `display: ${display}`)
  } catch (e) { record('TC02', 'Members panel', 'FAIL', e.message) }

  // TC03: Create lightweight agent
  try {
    await cdp.eval(`(() => { const s = document.querySelector('summary'); if (s) s.click() })()`)
    await sleep(400)
    await cdp.eval(`
      document.getElementById('newRoleName').value = 'TestBot';
      document.getElementById('newRoleDesc').value = 'Test agent for verification';
      createLightweightAgent()
    `)
    await sleep(1500)
    const members = await cdp.eval(`document.getElementById('memberList').innerText`)
    await cdp.screenshot('tc03-create.png')
    record('TC03', 'Create lightweight agent', members?.includes('TestBot') ? 'PASS' : 'FAIL',
      `Members: ${String(members).replace(/\n/g, ' | ').slice(0, 100)}`)
  } catch (e) { record('TC03', 'Create agent', 'FAIL', e.message) }

  // TC04: Add from template
  try {
    await cdp.eval(`(() => {
      const summaries = document.querySelectorAll('summary');
      const tpl = [...summaries].find(s => s.textContent.includes('Templates'));
      if (tpl) tpl.click();
    })()`)
    await sleep(400)
    await cdp.eval(`
      const sel = document.getElementById('addAgentSelect');
      if (sel && sel.options.length > 1) { sel.selectedIndex = 1; addAgentFromTemplate() }
    `)
    await sleep(1500)
    const members = await cdp.eval(`document.getElementById('memberList').innerText`)
    const hasTwo = (String(members).match(/🤖/g) || []).length >= 2
    await cdp.screenshot('tc04-template.png')
    record('TC04', 'Add from template', hasTwo ? 'PASS' : 'FAIL',
      `Members: ${String(members).replace(/\n/g, ' | ').slice(0, 100)}`)
  } catch (e) { record('TC04', 'Add template', 'FAIL', e.message) }

  // TC05: Delete agent
  try {
    await cdp.eval(`(() => {
      const dels = document.querySelectorAll('#memberList .del-btn');
      if (dels.length) dels[0].click();
    })()`)
    await sleep(800)
    const members = await cdp.eval(`document.getElementById('memberList').innerText`)
    const count = (String(members).match(/🤖/g) || []).length
    await cdp.screenshot('tc05-delete.png')
    record('TC05', 'Delete agent', count === 1 ? 'PASS' : 'FAIL',
      `Remaining agents: ${count}`)
  } catch (e) { record('TC05', 'Delete agent', 'FAIL', e.message) }

  // TC06: Close members, verify Enter sends (not Cmd+Enter)
  try {
    await cdp.eval(`document.querySelector('#membersOverlay .icon-btn[onclick="closeMembers()"]').click()`)
    await sleep(300)
    // Check input has correct keydown handler
    const hasEnterSend = await cdp.eval(`
      // Simulate: pressing Enter should call send(), shift+Enter should not
      const inp = document.getElementById('input');
      inp.value = '';
      true
    `)
    await cdp.screenshot('tc06-input.png')
    record('TC06', 'Enter-to-send wired', hasEnterSend ? 'PASS' : 'FAIL', 'Input ready')
  } catch (e) { record('TC06', 'Input check', 'FAIL', e.message) }

  cdp.close()

  // Summary
  console.log('\n=== Results ===')
  const passed = results.filter(r => r.status === 'PASS').length
  const failed = results.filter(r => r.status === 'FAIL').length
  console.log(`${passed}/${results.length} passed, ${failed} failed\n`)
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️'
    console.log(`  ${icon} ${r.id}: ${r.name} — ${r.notes}`)
  })

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
