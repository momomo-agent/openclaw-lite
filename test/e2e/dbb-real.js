const pup = require('puppeteer-core')

async function testCards() {
  const b = await pup.connect({ browserURL: 'http://127.0.0.1:9222' })
  const pages = await b.pages()
  const page = pages.find(p => p.url().includes('file://'))
  if (!page) throw new Error('No page')
  
  await page.keyboard.press('Escape')
  await new Promise(r => setTimeout(r, 300))

  async function send(text, waitMs = 12000) {
    const ta = await page.$('textarea')
    await ta.click()
    await ta.type(text, { delay: 10 })
    await page.keyboard.press('Enter')
    console.log(`  → "${text.slice(0,60)}"`)
    await new Promise(r => setTimeout(r, waitMs))
  }

  async function shot(name) {
    await page.screenshot({ path: `/tmp/paw-real-${name}.png` })
    console.log(`  📸 ${name}`)
  }

  // Use the Alice session that's already open and working
  
  // 1. 纯文本 (already verified above, do one more clean one)
  console.log('\n[1] 纯文本')
  await send('说 "测试通过" 两个字', 8000)
  await shot('01-text')

  // 2. 工具调用
  console.log('\n[2] 工具调用')
  await send('read the file package.json, show the first 3 lines', 15000)
  await shot('02-tool')

  // 3. Markdown
  console.log('\n[3] Markdown')
  await send('show me: a JS code block with console.log("hello"), a 3-item list, and a 2x2 table', 12000)
  await shot('03-markdown')

  // 4. 多步工具
  console.log('\n[4] 多步工具')
  await send('first run ls to list files, then read the first 2 lines of README.md', 18000)
  await shot('04-multi-tool')

  // 5. 错误 (file not found - tool returns error, not API error)
  console.log('\n[5] 工具错误')
  await send('read /nonexistent/file/404.txt', 8000)
  await shot('05-tool-error')

  // 6. Scroll to top for full view
  await page.evaluate(() => {
    const m = document.querySelector('[data-testid="message-list"]')
    if (m) m.scrollTop = 0
  })
  await new Promise(r => setTimeout(r, 300))
  await shot('06-top')

  // Scroll to bottom
  await page.evaluate(() => {
    const m = document.querySelector('[data-testid="message-list"]')
    if (m) m.scrollTop = m.scrollHeight
  })
  await new Promise(r => setTimeout(r, 300))
  await shot('07-bottom')

  console.log('\n✅ Done')
  await b.disconnect()
}

testCards().catch(e => console.error('ERROR:', e.message))
