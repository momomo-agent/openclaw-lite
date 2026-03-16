const pw = require('playwright')

async function testMentionDelegate() {
  const browser = await pw.chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0]?.pages()[0]
  
  // Input area
  const input = await page.$('textarea, [contenteditable="true"]')
  if (!input) throw new Error('No input')
  
  // Type @Claude mention + task
  await input.fill('@Claude 帮我在这个项目里创建一个 test.js 文件')
  await page.keyboard.press('Enter')
  
  console.log('✓ Sent @Claude message')
  
  // Wait for response
  await page.waitForTimeout(5000)
  
  await page.screenshot({ path: '/tmp/paw-group-delegate.png', fullPage: true })
  console.log('✓ Screenshot: /tmp/paw-group-delegate.png')
  
  await browser.close()
}

testMentionDelegate().catch(e => console.error(e.message))
