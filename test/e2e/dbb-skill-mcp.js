const pw = require('playwright')

async function testSkillMcp() {
  const browser = await pw.chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0]?.pages()[0]
  if (!page) throw new Error('No page')

  // Close overlay if any
  const backdrop = await page.$('.overlay-backdrop')
  if (backdrop) await backdrop.click({ force: true })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  async function send(text, waitMs = 12000) {
    const input = await page.$('textarea')
    if (!input) throw new Error('No textarea')
    await input.fill(text)
    await page.keyboard.press('Enter')
    console.log(`  → "${text.slice(0, 60)}"`)
    await page.waitForTimeout(waitMs)
  }

  async function shot(name) {
    await page.screenshot({ path: `/tmp/paw-sm-${name}.png`, fullPage: true })
    console.log(`  📸 ${name}`)
  }

  // Use "Paw系统Prompt设计评审" session (Jarvis workspace, has API key issue)
  // Actually use Claude session
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

  // ===== SKILL TESTS =====

  // 1. List skills (agent reads from system prompt)
  console.log('\n[1] 查看已安装 skills')
  await send('列出当前工作区的所有 skills', 8000)
  await shot('01-skill-list')

  // 2. Create a new skill
  console.log('\n[2] 创建 skill')
  await send('创建一个叫 test-greeting 的 skill，描述是 "A simple greeting skill"', 10000)
  await shot('02-skill-create')

  // 3. Execute skill
  console.log('\n[3] 执行 skill')
  await send('执行 test-greeting skill', 8000)
  await shot('03-skill-exec')

  // 4. Remove skill (should use file operations since no tool exists)
  console.log('\n[4] 移除 skill')
  await send('删除 test-greeting skill 目录', 8000)
  await shot('04-skill-remove')

  // ===== MCP TESTS =====

  // 5. List MCP servers
  console.log('\n[5] 查看 MCP 服务器')
  await send('用 mcp_config 工具列出当前所有 MCP 服务器', 8000)
  await shot('05-mcp-list')

  // 6. Add MCP server
  console.log('\n[6] 添加 MCP 服务器')
  await send('用 mcp_config 添加一个叫 test-fs 的 MCP 服务器，命令是 npx，参数是 ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]', 10000)
  await shot('06-mcp-add')

  // 7. Check MCP status
  console.log('\n[7] MCP 状态')
  await send('用 mcp_config 查看 MCP 服务器状态', 8000)
  await shot('07-mcp-status')

  // 8. Remove MCP server
  console.log('\n[8] 移除 MCP 服务器')
  await send('用 mcp_config 移除 test-fs MCP 服务器', 8000)
  await shot('08-mcp-remove')

  console.log('\n✅ Done')
  await browser.close()
}

testSkillMcp().catch(e => console.error('ERROR:', e.message))
