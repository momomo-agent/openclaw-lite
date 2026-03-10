// .ai/dbb/e2e-ipc-chat.js — E2E: test the exact chat IPC handler code path
// Directly invokes the streaming functions with mock params to find the pushStatus error

const path = require('path');

// We need to test the EXACT code path in main.js
// Since we can't require main.js directly (Electron-only), 
// let's extract and test the critical section

// 1. Read main.js source
const fs = require('fs');
const src = fs.readFileSync(path.resolve(__dirname, '../../main.js'), 'utf8');

// 2. Check pushStatus is a function declaration (not inside a closure)
const pushStatusMatch = src.match(/^function pushStatus\(/m);
console.log(`pushStatus is top-level function declaration: ${!!pushStatusMatch}`);

// 3. Check if streamAnthropic references pushStatus
const streamSection = src.slice(src.indexOf('async function streamAnthropic'), src.indexOf('async function streamOpenAI'));
const pushStatusRefs = (streamSection.match(/pushStatus/g) || []).length;
console.log(`streamAnthropic references pushStatus: ${pushStatusRefs} times`);

// 4. Find the EXACT line numbers
const lines = src.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('pushStatus') && !lines[i].trim().startsWith('//')) {
    console.log(`  L${i+1}: ${lines[i].trim().slice(0, 80)}`);
  }
}

// 5. Check if there's a scoping issue - is pushStatus inside app.whenReady?
const whenReadyStart = src.indexOf('app.whenReady()');
const pushStatusPos = src.indexOf('function pushStatus(');
console.log(`\napp.whenReady() starts at char ${whenReadyStart}`);
console.log(`pushStatus defined at char ${pushStatusPos}`);

// Find the closing of whenReady
let depth = 0;
let whenReadyEnd = -1;
for (let i = whenReadyStart; i < src.length; i++) {
  if (src[i] === '{') depth++;
  if (src[i] === '}') {
    depth--;
    if (depth === 0) { whenReadyEnd = i; break; }
  }
}
console.log(`app.whenReady() ends at char ${whenReadyEnd}`);
console.log(`pushStatus is INSIDE whenReady: ${pushStatusPos > whenReadyStart && pushStatusPos < whenReadyEnd}`);

// 6. Find what scope streamAnthropic is in
const streamAnthropicPos = src.indexOf('async function streamAnthropic(');
console.log(`\nstreamAnthropic defined at char ${streamAnthropicPos}`);
console.log(`streamAnthropic is INSIDE whenReady: ${streamAnthropicPos > whenReadyStart && streamAnthropicPos < whenReadyEnd}`);

// 7. Check if chat handler is inside whenReady
const chatHandlerPos = src.indexOf("ipcMain.handle('chat',");
console.log(`\nchat handler at char ${chatHandlerPos}`);
console.log(`chat handler is INSIDE whenReady: ${chatHandlerPos > whenReadyStart && chatHandlerPos < whenReadyEnd}`);

console.log('\n=== DIAGNOSIS ===');
if (streamAnthropicPos > whenReadyStart && streamAnthropicPos < whenReadyEnd && 
    pushStatusPos > whenReadyEnd) {
  console.log('❌ BUG FOUND: streamAnthropic is INSIDE whenReady closure but pushStatus is OUTSIDE');
  console.log('   pushStatus function declaration only hoists within its own scope');
  console.log('   Fix: move pushStatus inside whenReady OR move streamAnthropic outside');
} else if (pushStatusPos > whenReadyStart && pushStatusPos < whenReadyEnd &&
           streamAnthropicPos > whenReadyEnd) {
  console.log('❌ BUG FOUND: pushStatus is INSIDE whenReady closure but streamAnthropic is OUTSIDE');
} else {
  console.log('✅ Both in same scope - pushStatus should be accessible');
}
