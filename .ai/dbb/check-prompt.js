#!/usr/bin/env node
/** Quick check: does the system prompt contain orchestrator instructions when agents exist? */
const http = require('http')
const net = require('net')
const crypto = require('crypto')

const CDP_PORT = 9224

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(d)) }).on('error',reject)
  })
}

class CDPClient {
  constructor(wsUrl) { this.wsUrl = wsUrl; this.msgId = 1; this.pending = new Map() }
  connect() {
    const url = new URL(this.wsUrl)
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(parseInt(url.port), url.hostname, () => {
        const key = crypto.randomBytes(16).toString('base64')
        this.socket.write(`GET ${url.pathname} HTTP/1.1\r\nHost: ${url.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`)
      })
      this.socket.on('error', reject)
      let buf = Buffer.alloc(0), handshakeDone = false
      this.socket.on('data', (data) => {
        buf = Buffer.concat([buf, data])
        if (!handshakeDone) { const idx = buf.indexOf('\r\n\r\n'); if (idx===-1)return; handshakeDone=true; buf=buf.slice(idx+4); resolve() }
        while (buf.length >= 2) {
          let payloadLen = buf[1]&0x7f, offset = 2
          if (payloadLen===126){if(buf.length<4)return;payloadLen=buf.readUInt16BE(2);offset=4}
          else if(payloadLen===127){if(buf.length<10)return;payloadLen=Number(buf.readBigUInt64BE(2));offset=10}
          if(buf.length<offset+payloadLen)return
          const payload=buf.slice(offset,offset+payloadLen);buf=buf.slice(offset+payloadLen)
          if((buf[0]??0x81)&&true){try{const msg=JSON.parse(payload.toString());if(msg.id&&this.pending.has(msg.id)){this.pending.get(msg.id).resolve(msg);this.pending.delete(msg.id)}}catch{}}
        }
      })
    })
  }
  send(method, params={}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++
      const timer = setTimeout(()=>{this.pending.delete(id);reject(new Error('timeout'))}, 30000)
      this.pending.set(id, {resolve:(msg)=>{clearTimeout(timer);resolve(msg)}})
      const cmd = JSON.stringify({id,method,params}), payload=Buffer.from(cmd), mask=crypto.randomBytes(4)
      let header; if(payload.length<126){header=Buffer.alloc(6);header[0]=0x81;header[1]=0x80|payload.length;mask.copy(header,2)}
      else{header=Buffer.alloc(8);header[0]=0x81;header[1]=0x80|126;header.writeUInt16BE(payload.length,2);mask.copy(header,4)}
      const masked=Buffer.alloc(payload.length);for(let i=0;i<payload.length;i++)masked[i]=payload[i]^mask[i%4]
      this.socket.write(Buffer.concat([header,masked]))
    })
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true})
    if(r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description||'eval error')
    return r.result?.result?.value
  }
  close() { if(this.socket) this.socket.destroy() }
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

async function main() {
  const raw = await httpGet(`http://localhost:${CDP_PORT}/json`)
  const pages = JSON.parse(raw)
  const page = pages.find(p=>p.url?.includes('index.html'))||pages[0]
  const cdp = new CDPClient(page.webSocketDebuggerUrl)
  await cdp.connect()

  // Create session + agents
  await cdp.eval(`newSession()`)
  await sleep(2000)
  await cdp.eval(`toggleMembers()`)
  await sleep(600)
  await cdp.eval(`(() => { const d = document.querySelectorAll('.agent-create-section'); if (d[0] && !d[0].open) d[0].open = true; })()`)
  await sleep(300)
  await cdp.eval(`document.getElementById('newRoleName').value = '设计'; document.getElementById('newRoleDesc').value = 'UI设计师'; createLightweightAgent()`)
  await sleep(1500)
  await cdp.eval(`document.getElementById('newRoleName').value = '架构'; document.getElementById('newRoleDesc').value = '系统架构师'; createLightweightAgent()`)
  await sleep(1500)
  await cdp.eval(`closeMembers()`)
  await sleep(300)

  // Now check system prompt
  const prompt = await cdp.eval(`window.api.buildSystemPrompt()`)

  if (prompt.includes('Session Members')) {
    const idx = prompt.indexOf('Session Members')
    console.log('✅ Session Members found in system prompt')
    console.log('\n--- Excerpt ---')
    console.log(prompt.slice(idx, idx + 800))
  } else {
    console.log('❌ No Session Members in system prompt!')
    console.log('\n--- Last 500 chars ---')
    console.log(prompt.slice(-500))
  }

  // Also check: is send_message in the tools?
  if (prompt.includes('send_message')) {
    console.log('\n✅ send_message mentioned in prompt')
  } else {
    console.log('\n❌ send_message NOT in prompt')
  }

  // Check: orchestrator keyword
  if (prompt.includes('orchestrator') || prompt.includes('MUST delegate')) {
    console.log('✅ Orchestrator instructions present')
  } else {
    console.log('❌ Orchestrator instructions MISSING')
  }

  cdp.close()
}

main().catch(e=>{console.error(e);process.exit(1)})
