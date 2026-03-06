// M19 F067 集成验证 — 在 Electron 环境跑
// 用法: electron --no-sandbox -r .ai/dbb/m19-verify.js
const { app } = require('electron');

app.whenReady().then(async () => {
  const ss = require('../../session-store');
  const clawDir = '/tmp/paw-m19-verify-' + Date.now();
  const fs = require('fs');
  fs.mkdirSync(clawDir, { recursive: true });

  const results = [];
  function tc(name, pass, detail) {
    results.push({ name, pass, detail });
    console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  }

  // TC1: 单 agent 对话基础
  const session = ss.createSession(clawDir, 'M19 Test');
  tc('TC1: createSession', !!session.id, session.id);

  // TC2: 创建轻量 agent
  const designer = ss.createSessionAgent(clawDir, session.id, { name: '设计师', role: 'UI/UX specialist' });
  tc('TC2: createAgent', designer && designer.id.startsWith('a'), designer?.id);

  // TC3: 创建第二个轻量 agent
  const coder = ss.createSessionAgent(clawDir, session.id, { name: 'Coder', role: 'Writes code' });
  tc('TC3: createAgent2', coder && coder.id.startsWith('a'), coder?.id);

  // TC4: 列出 agents
  const agents = ss.listSessionAgents(clawDir, session.id);
  tc('TC4: listAgents', agents.length === 2, `count=${agents.length}`);

  // TC5: 按名查找
  const found = ss.findSessionAgentByName(clawDir, session.id, '设计师');
  tc('TC5: findByName', found && found.name === '设计师', found?.name);

  // TC6: getSessionAgent
  const got = ss.getSessionAgent(clawDir, designer.id);
  tc('TC6: getAgent', got && got.role === 'UI/UX specialist', got?.role);

  // TC7: 删除 agent
  const deleted = ss.deleteSessionAgent(clawDir, designer.id);
  const remaining = ss.listSessionAgents(clawDir, session.id);
  tc('TC7: deleteAgent', deleted && remaining.length === 1, `remaining=${remaining.length}`);

  // TC8: 级联删除
  ss.deleteSession(clawDir, session.id);
  const orphans = ss.listSessionAgents(clawDir, session.id);
  tc('TC8: cascadeDelete', orphans.length === 0, `orphans=${orphans.length}`);

  // TC9: 持久化验证
  const s2 = ss.createSession(clawDir, 'Persist Test');
  const a3 = ss.createSessionAgent(clawDir, s2.id, { name: 'Persist', role: 'test persistence' });
  ss.closeDb();
  const reopened = ss.getSessionAgent(clawDir, a3.id);
  tc('TC9: persistence', reopened && reopened.name === 'Persist', reopened?.name);

  // TC10: router.js 导入验证
  try {
    const { routeMessage } = require('../../core/router');
    tc('TC10: router import', typeof routeMessage === 'function');
  } catch (e) {
    tc('TC10: router import', false, e.message);
  }

  // TC11: prompt-builder 导入验证
  try {
    const pb = require('../../core/prompt-builder');
    tc('TC11: prompt-builder import', typeof pb.buildSystemPrompt === 'function' || typeof pb === 'function');
  } catch (e) {
    tc('TC11: prompt-builder import', false, e.message);
  }

  // Summary
  console.log('\n' + '='.repeat(40));
  const passed = results.filter(r => r.pass).length;
  console.log(`Result: ${passed}/${results.length} passed`);
  if (passed === results.length) {
    console.log('🎉 M19 F067 ALL PASS');
  } else {
    console.log('⚠️  Some tests failed');
    results.filter(r => !r.pass).forEach(r => console.log(`  ❌ ${r.name}: ${r.detail || ''}`));
  }

  ss.closeDb();
  app.quit();
});
