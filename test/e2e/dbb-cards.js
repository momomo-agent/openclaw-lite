const pw = require('playwright')

async function testCardsInWorkingSession() {
  const browser = await pw.chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0]?.pages()[0]
  if (!page) throw new Error('No page')

  // Close overlay
  const backdrop = await page.$('.overlay-backdrop')
  if (backdrop) await backdrop.click({ force: true })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  async function send(text, waitMs = 10000) {
    const input = await page.$('textarea')
    if (!input) throw new Error('No textarea')
    await input.fill(text)
    await page.keyboard.press('Enter')
    console.log(`  → "${text.slice(0, 60)}"`)
    await page.waitForTimeout(waitMs)
  }

  async function shot(name) {
    await page.screenshot({ path: `/tmp/paw-card-${name}.png`, fullPage: true })
    console.log(`  📸 ${name}`)
  }

  // Switch to Claude session (coding agent, known to work)
  const sessions = await page.$$('[data-testid="session-item"]')
  for (const s of sessions) {
    const text = await s.innerText()
    if (text.includes('Claude') && text.includes('paw')) {
      await s.click()
      await page.waitForTimeout(500)
      console.log('✓ Switched to Claude · paw')
      break
    }
  }

  await shot('00-start')

  // ===== 1. 纯文本对话 =====
  console.log('\n[1] 纯文本对话')
  await send('说 "测试通过" 三个字，不要说其他的', 6000)
  await shot('01-text')

  // ===== 2. 工具调用 =====
  console.log('\n[2] 工具调用')
  await send('读取当前目录的 package.json 文件', 10000)
  await shot('02-tool')

  // ===== 3. Markdown 渲染 =====
  console.log('\n[3] Markdown')
  await send('展示一个JS代码块(3行)、一个3项列表、一个2x2表格', 8000)
  await shot('03-markdown')

  // ===== 4. 多步工具 =====
  console.log('\n[4] 多步工具')
  await send('先列出当前目录文件，再读 README.md 前3行', 12000)
  await shot('04-multi-tool')

  console.log('\n✅ Done')
  await browser.close()
}

testCardsInWorkingSession().catch(e => console.error('ERROR:', e.message))
