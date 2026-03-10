// .ai/dbb/e2e-playwright.js — Full E2E via Playwright CDP to Electron
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS = '/tmp/paw-e2e';

async function main() {
  fs.mkdirSync(SCREENSHOTS, { recursive: true });
  
  console.log('Connecting to Electron via CDP...');
  const browser = await chromium.connectOverCDP('http://localhost:9228', { timeout: 10000 });
  const page = browser.contexts()[0].pages()[0];
  console.log('Connected! Title:', await page.title());
  
  // ═══ Test 1: Initial state ═══
  console.log('\n🧪 Test 1: Initial state');
  await page.screenshot({ path: `${SCREENSHOTS}/e2e-01-initial.png`, fullPage: true });
  console.log('  📸 e2e-01-initial.png saved');
  
  // Check UI elements exist
  const input = page.locator('#input');
  const sendBtn = page.locator('#sendBtn');
  const sidebar = page.locator('.session-list, #sessionList, .sidebar');
  
  console.log('  Input visible:', await input.isVisible());
  console.log('  Send button visible:', await sendBtn.isVisible());
  
  // ═══ Test 2: Type and send a message ═══
  console.log('\n🧪 Test 2: Send chat message');
  await input.fill('Say exactly: "Hello from Paw! Everything is working." Nothing else.');
  await page.screenshot({ path: `${SCREENSHOTS}/e2e-02-typed.png`, fullPage: true });
  console.log('  📸 e2e-02-typed.png saved');
  
  await sendBtn.click();
  console.log('  Message sent, waiting for response...');
  
  // Wait for the "thinking" status to appear (indicates request was sent)
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SCREENSHOTS}/e2e-03-thinking.png`, fullPage: true });
  console.log('  📸 e2e-03-thinking.png saved (should show thinking/streaming)');
  
  // Wait for response to complete (look for status "Done" or check message card)
  try {
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll('.message-card, .card, [class*="card"]');
      return cards.length >= 2; // user + assistant cards
    }, { timeout: 30000 });
    console.log('  ✅ Response received!');
  } catch (e) {
    console.log('  ⚠️ Timeout waiting for response, taking screenshot anyway');
  }
  
  await page.screenshot({ path: `${SCREENSHOTS}/e2e-04-response.png`, fullPage: true });
  console.log('  📸 e2e-04-response.png saved');
  
  // Check response content
  const responseText = await page.evaluate(() => {
    const cards = document.querySelectorAll('.message-card, .card, [class*="card"]');
    return Array.from(cards).map(c => c.textContent?.slice(0, 200));
  });
  console.log('  Cards:', JSON.stringify(responseText));
  
  // ═══ Test 3: Multi-turn ═══
  console.log('\n🧪 Test 3: Multi-turn conversation');
  await input.fill('What is 2 + 2? Answer with just the number.');
  await sendBtn.click();
  console.log('  Second message sent...');
  
  try {
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll('.message-card, .card, [class*="card"]');
      return cards.length >= 4; // 2 user + 2 assistant
    }, { timeout: 30000 });
    console.log('  ✅ Second response received!');
  } catch (e) {
    console.log('  ⚠️ Timeout on second response');
  }
  
  await page.screenshot({ path: `${SCREENSHOTS}/e2e-05-multiturn.png`, fullPage: true });
  console.log('  📸 e2e-05-multiturn.png saved');
  
  // ═══ Test 4: Check for errors ═══
  console.log('\n🧪 Test 4: Error check');
  const hasError = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasPushStatusError: text.includes('pushStatus is not defined'),
      hasSessionExpiryError: text.includes('_sessionExpiry is not defined'),
      hasAnyReferenceError: text.includes('ReferenceError'),
      hasApiKeyError: text.includes('No API key'),
    };
  });
  console.log('  Errors:', JSON.stringify(hasError));
  
  // Final summary
  console.log('\n═══════════════════════════════════');
  console.log('  E2E RESULTS');
  console.log('═══════════════════════════════════');
  const allClear = !Object.values(hasError).some(v => v);
  console.log(`  Errors: ${allClear ? '✅ NONE' : '❌ FOUND'}`);
  console.log(`  Screenshots in: ${SCREENSHOTS}/`);
  
  await browser.close();
}

main().catch(e => {
  console.error('E2E FAILED:', e.message);
  process.exit(1);
});
