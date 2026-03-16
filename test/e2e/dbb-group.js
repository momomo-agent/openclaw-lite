const pw = require('playwright')

async function testGroupDelegate() {
  const browser = await pw.chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0]?.pages()[0]
  
  // 1. Switch to group chat
  const sessions = await page.$$('[data-testid="session-item"]')
  for (const s of sessions) {
    const text = await s.innerText()
    if (text.includes('群聊')) {
      await s.click()
      await page.waitForTimeout(500)
      break
    }
  }
  console.log('✓ Switched to group chat')
  
  // 2. Open members panel to add coding agent
  const membersBtn = await page.$('button[title*="成员"], button:has-text("成员")')
  if (membersBtn) {
    await membersBtn.click()
    await page.waitForTimeout(500)
    console.log('✓ Opened members panel')
    await page.screenshot({ path: '/tmp/paw-group-members.png', fullPage: true })
  }
  
  await browser.close()
}

testGroupDelegate().catch(e => console.error(e.message))
