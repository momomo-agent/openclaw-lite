// .ai/dbb/e2e-cdp-test.js — CDP-based E2E test with screenshots
// Uses Node 25 native WebSocket (no ws package needed)
const fs = require('fs');
const http = require('http');

const CDP_URL = 'http://localhost:9222';
const SCREENSHOTS_DIR = '/tmp/paw-e2e';

async function getTarget() {
  return new Promise((resolve, reject) => {
    http.get(`${CDP_URL}/json`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function cdpConnect(wsUrl) {
  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);
    let id = 1;
    const pending = new Map();
    
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    });
    
    ws.addEventListener('open', () => {
      const send = (method, params = {}) => {
        return new Promise((res) => {
          const msgId = id++;
          pending.set(msgId, res);
          ws.send(JSON.stringify({ id: msgId, method, params }));
        });
      };
      resolve({ ws, send });
    });
  });
}

async function screenshot(cdp, name) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(result.result.data, 'base64');
  const path = `${SCREENSHOTS_DIR}/${name}.png`;
  fs.writeFileSync(path, buf);
  console.log(`  📸 ${name}: ${path} (${buf.length} bytes)`);
  return path;
}

async function main() {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  
  const targets = await getTarget();
  const page = targets.find(t => t.type === 'page');
  if (!page) { console.error('No page target'); process.exit(1); }
  
  const cdp = await cdpConnect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  
  console.log('\n🧪 E2E Test 1: Initial state (cold start)');
  await screenshot(cdp, '01-initial-state');
  
  console.log('\n🧪 E2E Test 2: Type and send a message');
  // Find the input and type
  await cdp.send('Runtime.evaluate', {
    expression: `
      const input = document.querySelector('#prompt-input, textarea, input[type="text"]');
      if (input) {
        input.value = 'Say hello and tell me what tools you have available.';
        input.dispatchEvent(new Event('input', {bubbles: true}));
        // Find and click send button
        const sendBtn = document.querySelector('#send-btn, button[type="submit"], .send-button');
        if (sendBtn) sendBtn.click();
        'sent';
      } else {
        'no input found: ' + document.querySelector('.input-area')?.innerHTML?.slice(0,200);
      }
    `
  });
  
  await screenshot(cdp, '02-message-sent');
  
  // Wait for response
  console.log('  ⏳ Waiting for LLM response (15s)...');
  await new Promise(r => setTimeout(r, 15000));
  await screenshot(cdp, '03-response-received');
  
  // Check for errors in console
  console.log('\n🧪 E2E Test 3: Check for errors');
  const consoleResult = await cdp.send('Runtime.evaluate', {
    expression: `
      // Check if there's an error message visible
      const errorEls = document.querySelectorAll('.error, [class*="error"], [class*="Error"]');
      const errors = Array.from(errorEls).map(e => e.textContent?.slice(0, 100));
      
      // Check message cards
      const cards = document.querySelectorAll('.message-card, .chat-message, [class*="message"]');
      const cardTexts = Array.from(cards).map(c => c.textContent?.slice(0, 100));
      
      JSON.stringify({ errors, cardCount: cards.length, cardTexts });
    `
  });
  console.log('  DOM state:', consoleResult.result?.value);
  
  // Send a second message (multi-turn test)
  console.log('\n🧪 E2E Test 4: Multi-turn conversation');
  await cdp.send('Runtime.evaluate', {
    expression: `
      const input = document.querySelector('#prompt-input, textarea, input[type="text"]');
      if (input) {
        input.value = 'What is 2+2?';
        input.dispatchEvent(new Event('input', {bubbles: true}));
        const sendBtn = document.querySelector('#send-btn, button[type="submit"], .send-button');
        if (sendBtn) sendBtn.click();
        'sent second message';
      } else 'no input';
    `
  });
  
  await new Promise(r => setTimeout(r, 10000));
  await screenshot(cdp, '04-multi-turn');
  
  // Final state
  const finalResult = await cdp.send('Runtime.evaluate', {
    expression: `
      const cards = document.querySelectorAll('.message-card, .chat-message, [class*="message"]');
      const status = document.querySelector('.status, [class*="status"]');
      JSON.stringify({
        messageCount: cards.length,
        statusText: status?.textContent?.slice(0, 50),
        hasError: document.body.textContent.includes('Error') || document.body.textContent.includes('error'),
      });
    `
  });
  console.log('  Final state:', finalResult.result?.value);
  
  await screenshot(cdp, '05-final-state');
  
  console.log('\n═══════════════════════════════════');
  console.log('  E2E Screenshots saved to /tmp/paw-e2e/');
  console.log('═══════════════════════════════════');
  
  cdp.ws.close();
  process.exit(0);
}

main().catch(err => {
  console.error('E2E failed:', err);
  process.exit(1);
});
