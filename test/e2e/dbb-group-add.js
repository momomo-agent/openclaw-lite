const pw = require('playwright')

async function addExistingCA() {
  const browser = await pw.chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0]?.pages()[0]
  
  // Get existing coding agent workspace ID
  const caId = await page.evaluate(async () => {
    const workspaces = await window.api.listWorkspaces()
    const ca = workspaces.find(w => w.type === 'coding-agent' && w.path?.includes('projects/paw'))
    return ca?.id
  })
  
  if (!caId) throw new Error('No coding agent found')
  console.log('✓ Found CA:', caId)
  
  // Get group session ID
  const groupId = await page.evaluate(async () => {
    const sessions = await window.api.listSessions()
    return sessions.find(s => s.title?.includes('群聊'))?.id
  })
  
  console.log('✓ Group ID:', groupId)
  
  // Add participant via IPC
  const result = await page.evaluate(async ({ sid, wid }) => {
    return await window.api.addParticipant(sid, wid)
  }, { sid: groupId, wid: caId })
  
  console.log('✓ Added participant:', result)
  
  // Refresh and screenshot
  await page.reload()
  await page.waitForTimeout(1000)
  
  // Switch to group chat
  const sessions = await page.$$('[data-testid="session-item"]')
  for (const s of sessions) {
    const text = await s.innerText()
    if (text.includes('群聊')) {
      await s.click()
      await page.waitForTimeout(500)
      break
    }
  }
  
  await page.screenshot({ path: '/tmp/paw-group-with-ca.png', fullPage: true })
  console.log('✓ Screenshot: /tmp/paw-group-with-ca.png')
  
  await browser.close()
}

addExistingCA().catch(e => console.error(e.message))
