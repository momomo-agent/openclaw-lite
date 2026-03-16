const pw = require('playwright')

async function testAllCards() {
  const browser = await pw.chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 60000 })
  const page = browser.contexts()[0]?.pages()[0]
  if (!page) throw new Error('No page')

  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  async function send(text, waitMs = 15000) {
    const input = await page.$('textarea')
    if (!input) throw new Error('No textarea')
    await input.fill(text)
    await page.keyboard.press('Enter')
    console.log(`  → "${text.slice(0, 60)}"`)
    await page.waitForTimeout(waitMs)
  }

  async function shot(name) {
    await page.screenshot({ path: `/tmp/paw-final-${name}.png`, fullPage: true })
    console.log(`  📸 ${name}`)
  }

  // Switch to a session with Jarvis workspace
  const sessions = await page.$$('[data-testid="session-item"]')
  for (const s of sessions) {
    const text = await s.innerText()
    if (text.includes('Paw系统Prompt') || text.includes('Jarvis') || text.includes('秋刀')) {
      await s.click()
      await page.waitForTimeout(500)
      console.log('✓ Switched to:', text.slice(0, 30))
      break
    }
  }

  // ===== 1. 纯文本 =====
  console.log('\n[1] 纯文本')
  await send('说 "卡片测试通过" 不要说其他的', 10000)
  await shot('01-text')

  // ===== 2. 工具调用 =====
  console.log('\n[2] 工具调用')
  await send('用 file_read 读取 package.json 前5行', 15000)
  await shot('02-tool')

  // ===== 3. Markdown =====
  console.log('\n[3] Markdown')
  await send('展示一个JS代码块、一个3项列表、一个2x2表格', 12000)
  await shot('03-markdown')

  // ===== 4. 多步工具 =====
  console.log('\n[4] 多步工具')
  await send('先执行 ls，再读 README.md 前3行', 18000)
  await shot('04-multi-tool')

  // ===== 5. 错误 =====
  console.log('\n[5] 错误')
  await send('读取 /nonexistent/file.txt', 8000)
  await shot('05-error')

  // ===== 全景 =====
  const msgs = await page.$('[data-testid="message-list"]')
  if (msgs) await msgs.evaluate(el => el.scrollTop = 0)
  await page.waitForTimeout(300)
  await shot('06-top')
  if (msgs) await msgs.evaluate(el => el.scrollTop = el.scrollHeight)
  await page.waitForTimeout(300)
  await shot('07-bottom')

  console.log('\n✅ Done')
  await browser.close()
}

testAllCards().catch(e => console.error('ERROR:', e.message))
