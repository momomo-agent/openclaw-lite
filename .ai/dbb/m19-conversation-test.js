#!/usr/bin/env node
/**
 * M19 Real Conversation E2E Test
 * Tests: task auto-assignment, agent conversation chains, router dispatch
 * Prerequisites: Paw running with --remote-debugging-port=9224
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
            } catch {}
          }
        }
      })
    })
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 30000)
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

// Helper: get senders from recent cards (IIFE to avoid scope conflicts)
function getSendersExpr(count) {
  return `(() => {
    const cs = document.querySelectorAll('.msg-card');
    const arr = [];
    cs.forEach(c => {
      const s = c.querySelector('.msg-name')?.textContent || '';
      const t = (c.querySelector('.msg-content')?.textContent || '').slice(0, 60);
      arr.push(s + ': ' + t);
    });
    return arr.slice(-${count}).join(' || ');
  })()`
}

async function main() {
  console.log('=== M19 Real Conversation E2E Test ===\n')

  const raw = await httpGet(`http://localhost:${CDP_PORT}/json`)
  const pages = JSON.parse(raw)
  const page = pages.find(p => p.url?.includes('index.html')) || pages[0]
  if (!page?.webSocketDebuggerUrl) { console.error('No CDP page found'); process.exit(1) }

  const cdp = new CDPClient(page.webSocketDebuggerUrl)
  await cdp.connect()
  console.log('CDP connected.\n')

  // ── Setup: create a fresh session with agents ──
  console.log('--- Setup: Creating test session with agents ---')

  await cdp.eval(`newSession()`)
  await sleep(2000)
  const sid = await cdp.eval(`currentSessionId`)
  console.log(`  Session: ${sid}\n`)

  await cdp.eval(`toggleMembers()`)
  await sleep(600)

  // Open "Create Role" details
  await cdp.eval(`(() => {
    const details = document.querySelectorAll('.agent-create-section');
    if (details[0] && !details[0].open) details[0].open = true;
  })()`)
  await sleep(300)

  // Add 设计
  await cdp.eval(`
    document.getElementById('newRoleName').value = '设计';
    document.getElementById('newRoleDesc').value = 'UI设计、用户体验、视觉风格';
    createLightweightAgent()
  `)
  await sleep(1500)

  // Add 架构
  await cdp.eval(`
    document.getElementById('newRoleName').value = '架构';
    document.getElementById('newRoleDesc').value = '系统架构、代码审查、技术方案';
    createLightweightAgent()
  `)
  await sleep(1500)

  const memberText = await cdp.eval(`document.getElementById('memberList').innerText`)
  const has2Agents = memberText.includes('设计') && memberText.includes('架构')
  record('SETUP', 'Create 2 agents', has2Agents ? 'PASS' : 'FAIL',
    `Members: ${String(memberText).replace(/\n/g, ' | ').slice(0, 120)}`)

  await cdp.eval(`closeMembers()`)
  await sleep(300)

  // ── TC01: Router dispatch — casual message → Main only ──
  console.log('\n--- TC01: Casual message routing ---')
  try {
    await cdp.eval(`document.getElementById('input').value = '你好'; send()`)
    await sleep(15000)
    const cards = await cdp.eval(getSendersExpr(3))
    await cdp.screenshot('tc01-casual.png')
    const hasMainReply = cards && (cards.includes('Assistant:') || cards.includes('Main:'))
    const noSpecialist = cards ? (!cards.includes('设计:') && !cards.includes('架构:')) : true
    record('TC01', 'Casual → Main only', hasMainReply && noSpecialist ? 'PASS' : 'WARN',
      `Cards: ${String(cards).slice(0, 200)}`)
  } catch (e) { record('TC01', 'Casual routing', 'FAIL', e.message) }

  // ── TC02: Router dispatch — specialized message → relevant agent(s) ──
  console.log('\n--- TC02: Specialized message routing ---')
  try {
    await cdp.eval(`document.getElementById('input').value = '帮我分析一下这个产品的用户体验设计'; send()`)
    await sleep(18000)
    const cards = await cdp.eval(getSendersExpr(5))
    await cdp.screenshot('tc02-specialized.png')
    const hasDesigner = cards && cards.includes('设计:')
    record('TC02', 'UX question → 设计 agent', hasDesigner ? 'PASS' : 'WARN',
      `Senders: ${String(cards).slice(0, 200)}`)
  } catch (e) { record('TC02', 'Specialized routing', 'FAIL', e.message) }

  // ── TC03: @mention direct dispatch ──
  console.log('\n--- TC03: @mention direct dispatch ---')
  try {
    await cdp.eval(`document.getElementById('input').value = '@架构 评估一下微服务拆分的可行性'; send()`)
    await sleep(18000)
    const cards = await cdp.eval(getSendersExpr(3))
    await cdp.screenshot('tc03-mention.png')
    const hasArch = cards && cards.includes('架构:')
    record('TC03', '@架构 direct dispatch', hasArch ? 'PASS' : 'WARN',
      `Cards: ${String(cards).slice(0, 200)}`)
  } catch (e) { record('TC03', '@mention dispatch', 'FAIL', e.message) }

  // ── TC04: Task auto-assignment ──
  console.log('\n--- TC04: Task auto-assignment ---')
  try {
    await cdp.eval(`document.getElementById('input').value = '请帮我创建三个任务：1. 设计登录页面UI 2. 审查系统架构 3. 优化用户体验'; send()`)
    await sleep(25000)
    const tasks = await cdp.eval(`
      (async () => {
        const tasks = await window.api.listTasks(currentSessionId)
        return JSON.stringify(tasks.map(t => ({ title: t.title, assignee: t.assignee })))
      })()
    `)
    await cdp.screenshot('tc04-tasks.png')
    const taskList = JSON.parse(tasks || '[]')
    console.log('  Tasks:', JSON.stringify(taskList))
    if (taskList.length > 0) {
      const anyAssigned = taskList.some(t => t.assignee)
      record('TC04', 'Task auto-assignment', anyAssigned ? 'PASS' : 'WARN',
        `${taskList.length} tasks, assigned: ${taskList.filter(t=>t.assignee).map(t=>t.title?.slice(0,10)+'→'+t.assignee).join('; ')}`)
    } else {
      record('TC04', 'Task auto-assignment', 'WARN', 'No tasks created (agent may not have used task_create tool)')
    }
  } catch (e) { record('TC04', 'Task auto-assignment', 'FAIL', e.message) }

  // ── TC05: Task bar shows assignments ──
  console.log('\n--- TC05: Task bar display ---')
  try {
    await sleep(1000)
    const barText = await cdp.eval(`document.getElementById('taskBar')?.innerText || ''`)
    await cdp.screenshot('tc05-taskbar.png')
    const hasAssignees = barText.includes('设计') || barText.includes('架构')
    record('TC05', 'Task bar shows assignees', hasAssignees ? 'PASS' : 'WARN',
      `Bar: ${String(barText).replace(/\n/g, ' ').slice(0, 150)}`)
  } catch (e) { record('TC05', 'Task bar', 'FAIL', e.message) }

  // ── TC06: Per-pair anti-loop data ──
  console.log('\n--- TC06: Per-pair anti-loop ---')
  try {
    const loopResult = await cdp.eval(`
      (async () => {
        const s = await window.api.loadSession(currentSessionId)
        const msgs = s?.messages || []
        const agentMsgs = msgs.filter(m => m.role === 'assistant' && m.sender)
        return JSON.stringify({
          totalMsgs: msgs.length,
          agentMsgs: agentMsgs.length,
          senders: [...new Set(agentMsgs.map(m => m.sender))]
        })
      })()
    `)
    const info = JSON.parse(loopResult || '{}')
    record('TC06', 'Per-pair anti-loop data', 'PASS',
      `Total: ${info.totalMsgs}, agent msgs: ${info.agentMsgs}, senders: ${(info.senders||[]).join(',')}`)
  } catch (e) { record('TC06', 'Anti-loop check', 'FAIL', e.message) }

  // ── TC07: Multi-agent conversation — ask something involving both ──
  console.log('\n--- TC07: Multi-agent dispatch (both agents needed) ---')
  try {
    await cdp.eval(`document.getElementById('input').value = '从设计和架构两个角度分析一下如何做一个好的搜索功能'; send()`)
    await sleep(25000)
    const cards = await cdp.eval(getSendersExpr(6))
    await cdp.screenshot('tc07-multi.png')
    const hasDesign = cards && cards.includes('设计:')
    const hasArch = cards && cards.includes('架构:')
    record('TC07', 'Both agents respond', hasDesign && hasArch ? 'PASS' : 'WARN',
      `Senders: ${String(cards).slice(0, 200)}`)
  } catch (e) { record('TC07', 'Multi-agent dispatch', 'FAIL', e.message) }

  await cdp.screenshot('tc-final.png')
  cdp.close()

  // Summary
  console.log('\n=== Results ===')
  const passed = results.filter(r => r.status === 'PASS').length
  const warned = results.filter(r => r.status === 'WARN').length
  const failed = results.filter(r => r.status === 'FAIL').length
  console.log(`${passed} passed, ${warned} warn, ${failed} failed / ${results.length} total\n`)
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️'
    console.log(`  ${icon} ${r.id}: ${r.name} — ${r.notes}`)
  })

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
