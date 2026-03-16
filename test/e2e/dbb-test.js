const pw = require('playwright')

async function test() {
  const browser = await pw.chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0]?.pages()[0]
  
  const result = await page.evaluate(async () => {
    const workspaces = await window.api.listWorkspaces()
    return workspaces.map(w => ({
      id: w.id,
      name: w.name,
      type: w.type,
      engine: w.engine,
      path: w.path?.split('/').slice(-2).join('/')
    }))
  })
  
  console.log('Workspaces:', JSON.stringify(result, null, 2))
  await browser.close()
}
test().catch(e => console.error(e.message))
