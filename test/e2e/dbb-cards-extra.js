const pw = require('playwright')

async function testRemainingCards() {
  const browser = await pw.chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0]?.pages()[0]

  async function send(text, waitMs = 10000) {
    const input = await page.$('textarea')
    await input.fill(text)
    await page.keyboard.press('Enter')
    console.log(`  → "${text.slice(0, 60)}"`)
    await page.waitForTimeout(waitMs)
  }

  async function shot(name) {
    await page.screenshot({ path: `/tmp/paw-card-${name}.png`, fullPage: true })
    console.log(`  📸 ${name}`)
  }

  // ===== 5. Thinking (extended thinking) =====
  console.log('\n[5] Thinking 卡片')
  await send('用 extended thinking 思考：如何优化 Paw 的性能', 15000)
  await shot('05-thinking')

  // ===== 6. 群聊 delegate (agent-to-agent) =====
  console.log('\n[6] Agent-to-Agent (群聊 delegate)')
  // Switch to group chat
  const sessions = await page.$$('[data-testid="session-item"]')
  for (const s of sessions) {
    const text = await s.innerText()
    if (text.includes('群聊')) {
      await s.click()
      await page.waitForTimeout(500)
      console.log('  ✓ Switched to group chat')
      break
    }
  }
  await send('@Claude 创建一个 hello.txt 文件', 10000)
  await shot('06-delegate')

  console.log('\n✅ Done')
  await browser.close()
}

testRemainingCards().catch(e => console.error('ERROR:', e.message))
