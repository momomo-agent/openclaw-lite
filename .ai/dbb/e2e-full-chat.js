// .ai/dbb/e2e-full-chat.js — Full E2E: launch Paw, send chat via webContents.executeJavaScript
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  // Require main.js to set up all IPC handlers
  require('../../main.js');
  
  // Wait for window to be ready
  await new Promise(r => setTimeout(r, 3000));
  
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error('[E2E] No window found');
    app.quit();
    return;
  }
  
  console.log('[E2E] Window found, sending test chat...');
  
  try {
    // Send a chat message through the renderer's IPC
    const result = await win.webContents.executeJavaScript(`
      (async () => {
        try {
          const result = await window.electronAPI.chat({
            prompt: 'Say exactly "test ok" and nothing else.',
            history: [],
            rawMessages: [{ role: 'user', content: 'Say exactly "test ok" and nothing else.' }],
            sessionId: 'test-session',
            requestId: 'e2e-test-001',
          });
          return { ok: true, answer: (result?.answer || '').slice(0, 200) };
        } catch (err) {
          return { ok: false, error: err.message, stack: err.stack };
        }
      })()
    `);
    
    if (result.ok) {
      console.log(`[E2E] ✅ Chat succeeded: "${result.answer.slice(0, 100)}"`);
    } else {
      console.error(`[E2E] ❌ Chat failed: ${result.error}`);
      if (result.stack) console.error(result.stack);
    }
  } catch (err) {
    console.error(`[E2E] ❌ executeJavaScript failed: ${err.message}`);
    console.error(err.stack);
  }
  
  setTimeout(() => app.quit(), 1000);
});
