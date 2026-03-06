#!/usr/bin/env node
/**
 * Diagnosis: manually trigger agent-message to see if triggerAgentResponse works
 */
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
      let buf = Buffer.alloc(0), hd = false
      this.socket.on('data', (data) => {
        buf = Buffer.concat([buf, data])
        if (!hd) { const i=buf.indexOf('\r\n\r\n'); if(i===-1)return; hd=true; buf=buf.slice(i+4); resolve() }
        while (buf.length >= 2) {
          let pl=buf[1]&0x7f,off=2
          if(pl===126){if(buf.length<4)return;pl=buf.readUInt16BE(2);off=4}
          else if(pl===127){if(buf.length<10)return;pl=Number(buf.readBigUInt64BE(2));off=10}
          if(buf.length<off+pl)return
          const p=buf.slice(off,off+pl);buf=buf.slice(off+pl)
          try{const m=JSON.parse(p.toString());if(m.id&&this.pending.has(m.id)){this.pending.get(m.id).resolve(m);this.pending.delete(m.id)}}catch{}
        }
      })
    })
  }
  send(m,p={}){return new Promise((r,j)=>{const id=this.msgId++;const t=setTimeout(()=>{this.pending.delete(id);j(new Error('timeout'))},30000);this.pending.set(id,{resolve:m=>{clearTimeout(t);r(m)}});const c=JSON.stringify({id,method:m,params:p}),pl=Buffer.from(c),mk=crypto.randomBytes(4);let h;if(pl.length<126){h=Buffer.alloc(6);h[0]=0x81;h[1]=0x80|pl.length;mk.copy(h,2)}else{h=Buffer.alloc(8);h[0]=0x81;h[1]=0x80|126;h.writeUInt16BE(pl.length,2);mk.copy(h,4)};const ms=Buffer.alloc(pl.length);for(let i=0;i<pl.length;i++)ms[i]=pl[i]^mk[i%4];this.socket.write(Buffer.concat([h,ms]))})}
  async eval(e){const r=await this.send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)throw new Error(r.result.exceptionDetails.exception?.description||'err');return r.result?.result?.value}
  close(){if(this.socket)this.socket.destroy()}
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms))

async function main() {
  const raw = await httpGet(`http://localhost:${CDP_PORT}/json`)
  const pages = JSON.parse(raw)
  const page = pages.find(p=>p.url?.includes('index.html'))||pages[0]
  const cdp = new CDPClient(page.webSocketDebuggerUrl)
  await cdp.connect()
  console.log('Connected')

  // Setup
  await cdp.eval(`newSession()`)
  await sleep(2000)
  const sid = await cdp.eval(`currentSessionId`)
  console.log('Session:', sid)

  // Add 设计 agent
  await cdp.eval(`toggleMembers()`)
  await sleep(500)
  await cdp.eval(`(() => { const d = document.querySelectorAll('.agent-create-section'); if (d[0]&&!d[0].open) d[0].open=true })()`)
  await sleep(200)
  await cdp.eval(`document.getElementById('newRoleName').value='设计'; document.getElementById('newRoleDesc').value='UI设计'; createLightweightAgent()`)
  await sleep(1500)
  await cdp.eval(`closeMembers()`)
  await sleep(300)

  // Get the agent id
  const agentsJson = await cdp.eval(`(async()=>{const a=await window.api.listSessionAgents(currentSessionId);return JSON.stringify(a)})()`)
  const agents = JSON.parse(agentsJson)
  console.log('Agents:', agents)

  if (!agents.length) { console.log('No agents!'); cdp.close(); return }

  // First send a user message so session has content
  console.log('\n--- Step 1: Send a user message to Main ---')
  await cdp.eval(`document.getElementById('input').value='你好'; send()`)
  await sleep(15000)

  // Now manually simulate what send_message does:
  // emit agent-message IPC from renderer side
  console.log('\n--- Step 2: Manually trigger agent-message ---')
  const agentName = agents[0].name
  const agentId = agents[0].id
  console.log(`Simulating: Assistant → ${agentName}, message: "请从UI角度分析搜索功能"`)

  // Directly call triggerAgentResponse
  await cdp.eval(`
    (async () => {
      const sessionAgents = await window.api.listSessionAgents(currentSessionId)
      const target = sessionAgents.find(a => a.name === '${agentName}')
      if (!target) throw new Error('Agent not found: ${agentName}')
      // Simulate agent-to-agent card
      addCard('agent-to-agent', '请从UI角度分析搜索功能', 'Assistant → ${agentName}')
      // Trigger response
      triggerAgentResponse(target.id, target.name, '请从UI角度分析搜索功能的用户体验', currentSessionId)
    })()
  `)

  console.log('triggerAgentResponse fired. Waiting 20s...')
  for (let i = 0; i < 4; i++) {
    await sleep(5000)
    const cards = await cdp.eval(`(() => {
      const cs = document.querySelectorAll('.msg-card')
      return Array.from(cs).map(c => (c.querySelector('.msg-name')?.textContent||'?')+': '+(c.querySelector('.msg-content')?.textContent||'').slice(0,50)).join('\\n')
    })()`)
    console.log(`[${(i+1)*5}s] Cards:\n${cards}\n`)
  }

  cdp.close()
}
main().catch(e=>{console.error(e);process.exit(1)})
