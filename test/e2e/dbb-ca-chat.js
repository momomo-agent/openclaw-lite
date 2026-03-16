const pw = require('playwright')

async function testCodingAgentChat() {
  const browser = await pw.chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0]?.pages()[0]
  
  // 1. Click Claude session
  const sessions = await page.$$('[data-testid="session-item"]')
  for (const s of sessions) {
    const text = await s.innerText()
    if (text.includes('Claude')) {
      await s.click()
      await page.waitForTimeout(500)
      break
    }
  }
  
  console.log('✓ Switched to Claude session')
  
  // 2. Send a coding task
  const input = await page.$('textarea, [contenteditable="true"]')
  if (!input) throw new Error('No input found')
  
  await input.fill('创建一个 hello.txt 文件，内容是 "Hello from Claude Code"')
  await page.keyboard.press('Enter')
  
  console.log('✓ Sent message')
  
  // 3. Wait for response
  await page.waitForTimeout(3000)
  
  // 4. Screenshot
  await page.screenshot({ path: '/tmp/paw-ca-chat.png', fullPage: true })
  console.log('✓ Screenshot: /tmp/paw-ca-chat.png')
  
  await browser.close()
}

testCodingAgentChat().catch(e => console.error(e.message))
