#!/usr/bin/env node
/**
 * Focused TC07 test — orchestrator delegation
 * Tests: Main delegates to 设计+架构 via send_message, both respond
 */
const http = require('http')
const net = require('net')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const CDP_PORT = 9224
const SCREENSHOTS = path.join(__dirname, 'latest')
fs.mkdirSync(SCREENSHOTS, { recursive: true })

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

class CDPClient {
  constructor(wsUrl) { this.wsUrl = wsUrl; this.ws = null; this.msgId = 1; this.pending = new Map(); this.consoleLogs = [] }
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
        while (buf.length >= 2) {
          const opcode = buf[0] & 0x0f
          let payloadLen = buf[1] & 0x7f
          let offset = 2
          if (payloadLen === 126) { if (buf.length < 4) return; payloadLen = buf.readUInt16BE(2); offset = 4 }
          else if (payloadLen === 127) { if (buf.length < 10) return; payloadLen = Number(buf.readBigUInt64BE(2)); offset = 10 }
          if (buf.length < offset + payloadLen) return
          const payload = buf.slice(offset, offset + payloadLen)
          buf = buf.slice(offset + payloadLen)
          if (opcode === 1) {
            try {
              const msg = JSON.parse(payload.toString())
              if (msg.id && this.pending.has(msg.id)) { this.pending.get(msg.id).resolve(msg); this.pending.delete(msg.id) }
              // Capture console logs
              if (msg.method === 'Runtime.consoleAPICalled') {
                const text = (msg.params?.args || []).map(a => a.value || a.description || '').join(' ')
                if (text.includes('[Paw:renderer]')) this.consoleLogs.push(text)
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
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 60000)
      this.pending.set(id, { resolve: (msg) => { clearTimeout(timer); resolve(msg) } })
      const cmd = JSON.stringify({ id, method, params })
      const payload = Buffer.from(cmd)
      const mask = crypto.randomBytes(4)
      let header
      if (payload.length < 126) { header = Buffer.alloc(6); header[0] = 0x81; header[1] = 0x80 | payload.length; mask.copy(header, 2) }
      else if (payload.length < 65536) { header = Buffer.alloc(8); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); mask.copy(header, 4) }
      else { header = Buffer.alloc(14); header[0] = 0x81; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(payload.length), 2); mask.copy(header, 10) }
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
    if (r.result?.data) { const p = path.join(SCREENSHOTS, name); fs.writeFileSync(p, Buffer.from(r.result.data, 'base64')); console.log(`  📸 ${name}`); return p }
  }
  close() { if (this.socket) this.socket.destroy() }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log('=== Focused TC07: Orchestrator Delegation ===\n')

  const raw = await httpGet(`http://localhost:${CDP_PORT}/json`)
  const pages = JSON.parse(raw)
  const page = pages.find(p => p.url?.includes('index.html')) || pages[0]
  if (!page?.webSocketDebuggerUrl) { console.error('No CDP page found'); process.exit(1) }

  const cdp = new CDPClient(page.webSocketDebuggerUrl)
  await cdp.connect()
  console.log('CDP connected.\n')

  // Enable console log capture
  await cdp.send('Runtime.enable')

  // Setup: new session + 2 agents
  console.log('--- Setup ---')
  await cdp.eval(`newSession()`)
  await sleep(2000)
  const sid = await cdp.eval(`currentSessionId`)
  console.log(`  Session: ${sid}`)

  await cdp.eval(`toggleMembers()`)
  await sleep(600)
  await cdp.eval(`(() => { const d = document.querySelectorAll('.agent-create-section'); if (d[0] && !d[0].open) d[0].open = true; })()`)
  await sleep(300)

  // Add agents
  await cdp.eval(`document.getElementById('newRoleName').value = '设计'; document.getElementById('newRoleDesc').value = 'UI设计、用户体验、视觉风格'; createLightweightAgent()`)
  await sleep(1500)
  await cdp.eval(`document.getElementById('newRoleName').value = '架构'; document.getElementById('newRoleDesc').value = '系统架构、技术方案、代码审查'; createLightweightAgent()`)
  await sleep(1500)

  const members = await cdp.eval(`document.getElementById('memberList').innerText`)
  console.log(`  Members: ${members.replace(/\n/g, ' | ')}`)

  await cdp.eval(`closeMembers()`)
  await sleep(300)

  // ── TC07: Multi-agent delegation ──
  console.log('\n--- TC07: "从设计和架构两个角度分析搜索功能" ---')
  await cdp.eval(`document.getElementById('input').value = '从设计和架构两个角度分析一下如何做一个好的搜索功能'; send()`)

  // Wait longer — Main needs to respond + 2 agents need to respond
  console.log('  Waiting for Main + agents (60s)...')
  for (let i = 0; i < 12; i++) {
    await sleep(5000)
    const cardCount = await cdp.eval(`document.querySelectorAll('.msg-card').length`)
    const senders = await cdp.eval(`(() => {
      const cs = document.querySelectorAll('.msg-card');
      return Array.from(cs).map(c => (c.querySelector('.msg-name')?.textContent || '???')).join(', ')
    })()`)
    console.log(`  [${(i+1)*5}s] Cards: ${cardCount}, Senders: ${senders}`)

    // Check if both agents have responded
    if (senders.includes('设计') && senders.includes('架构')) {
      console.log('  ✅ Both agents responded!')
      break
    }
  }

  // Capture final state
  await cdp.screenshot('tc07-focused.png')

  // Get all card contents
  const allCards = await cdp.eval(`(() => {
    const cs = document.querySelectorAll('.msg-card');
    return Array.from(cs).map(c => {
      const name = c.querySelector('.msg-name')?.textContent || '???'
      const text = (c.querySelector('.msg-content')?.textContent || '').slice(0, 100)
      return name + ': ' + text
    }).join('\\n')
  })()`)
  console.log('\n--- All cards ---')
  console.log(allCards)

  // Console logs from renderer
  console.log('\n--- Renderer console logs ---')
  cdp.consoleLogs.forEach(l => console.log(`  ${l}`))

  // Check main process logs
  console.log('\n--- Main process logs (from stderr) ---')
  try {
    const log = fs.readFileSync('/tmp/paw-test.log', 'utf8')
    const pawLines = log.split('\n').filter(l => l.includes('[Paw'))
    pawLines.slice(-20).forEach(l => console.log(`  ${l}`))
  } catch {}

  cdp.close()
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
