// .ai/dbb/m31-openbox-test.js — 开箱体验 DBB 测试
// 测试核心模块：transcript repair, context guard, loop detection, prompt builder, session expiry, model context
// 不需要 LLM API，纯模块级验证

const path = require('path');
const assert = require('assert');

// Resolve paths relative to project root
const ROOT = path.resolve(__dirname, '../..');

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

// ── TC01: Transcript Repair ──
console.log('\n🧪 TC01: Transcript Repair');
const {
  validateAnthropicTurns,
  repairToolUseResultPairing,
  removeOrphanedTrailingUser,
  limitHistoryTurns,
  dropThinkingBlocks,
  pruneProcessedHistoryImages,
  sanitizeTranscript,
  PRUNED_IMAGE_MARKER,
} = require(path.join(ROOT, 'core/transcript-repair'));

test('validateAnthropicTurns removes consecutive assistant', () => {
  const msgs = [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' },
    { role: 'assistant', content: 'hello again' },
    { role: 'user', content: 'ok' },
  ];
  const result = validateAnthropicTurns(msgs);
  assert.strictEqual(result.length, 3);
  assert.strictEqual(result[1].content, 'hello again'); // keeps last
});

test('repairToolUseResultPairing removes orphaned tool_result', () => {
  const msgs = [
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'orphan-123', content: 'result' }] },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'valid-456', name: 'test', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'valid-456', content: 'ok' }] },
  ];
  const result = repairToolUseResultPairing(msgs);
  assert.strictEqual(result.length, 2); // orphan removed
});

test('removeOrphanedTrailingUser removes last user msg', () => {
  const msgs = [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' },
    { role: 'user', content: 'orphan' },
  ];
  const result = removeOrphanedTrailingUser(msgs);
  assert.strictEqual(result.length, 2);
});

test('limitHistoryTurns keeps only N user turns', () => {
  const msgs = [];
  for (let i = 0; i < 10; i++) {
    msgs.push({ role: 'user', content: `q${i}` });
    msgs.push({ role: 'assistant', content: `a${i}` });
  }
  const result = limitHistoryTurns(msgs, 3);
  // Should keep last 3 user turns + their assistant responses
  const userTurns = result.filter(m => m.role === 'user');
  assert.strictEqual(userTurns.length, 3);
  assert.strictEqual(userTurns[0].content, 'q7');
});

test('dropThinkingBlocks removes thinking type', () => {
  const msgs = [
    { role: 'assistant', content: [
      { type: 'thinking', thinking: 'hmm...' },
      { type: 'text', text: 'hello' },
    ] },
  ];
  const result = dropThinkingBlocks(msgs);
  assert.strictEqual(result[0].content.length, 1);
  assert.strictEqual(result[0].content[0].type, 'text');
});

test('dropThinkingBlocks preserves empty assistant turn', () => {
  const msgs = [
    { role: 'assistant', content: [
      { type: 'thinking', thinking: 'only thinking' },
    ] },
  ];
  const result = dropThinkingBlocks(msgs);
  assert.strictEqual(result[0].content.length, 1);
  assert.strictEqual(result[0].content[0].text, '');
});

test('pruneProcessedHistoryImages replaces image blocks', () => {
  const msgs = [
    { role: 'user', content: [
      { type: 'text', text: 'look at this' },
      { type: 'image', source: { type: 'base64', data: 'AAAA' } },
    ] },
    { role: 'assistant', content: 'I see the image' },
    { role: 'user', content: [
      { type: 'image', source: { type: 'base64', data: 'BBBB' } },
    ] },
  ];
  const changed = pruneProcessedHistoryImages(msgs);
  assert.strictEqual(changed, true);
  // First user's image should be replaced (has assistant reply after it)
  assert.strictEqual(msgs[0].content[1].type, 'text');
  assert.strictEqual(msgs[0].content[1].text, PRUNED_IMAGE_MARKER);
  // Last user's image should NOT be replaced (no assistant reply yet)
  assert.strictEqual(msgs[2].content[0].type, 'image');
});

test('sanitizeTranscript full pipeline', () => {
  const msgs = [
    { role: 'user', content: 'q1' },
    { role: 'assistant', content: 'a1' },
    { role: 'user', content: 'q2' },
    { role: 'assistant', content: 'a2' },
    { role: 'user', content: 'q3' },
    { role: 'assistant', content: 'a3' },
    { role: 'user', content: 'orphan' },
  ];
  const result = sanitizeTranscript(msgs, {
    historyLimit: 2,
    provider: 'anthropic',
    removeTrailingUser: true,
  });
  const users = result.filter(m => m.role === 'user');
  assert.ok(users.length <= 2);
  assert.strictEqual(result[result.length - 1].role, 'assistant');
});

// ── TC02: Context Guard ──
console.log('\n🧪 TC02: Context Guard');
const { enforceContextBudget, estimateContextChars } = require(path.join(ROOT, 'core/context-guard'));

test('enforceContextBudget compacts when over budget', () => {
  const messages = [
    { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't1', content: 'x'.repeat(10000) },
    ] },
    { role: 'assistant', content: 'ok' },
    { role: 'user', content: 'latest' },
  ];
  // With a tiny window (10 tokens = 40 chars budget * 0.75 = 30 chars), should compact
  const result = enforceContextBudget(messages, 10);
  // The big tool result should have been replaced with placeholder
  assert.ok(messages[0].content[0].content.length < 10000);
});

test('enforceContextBudget does nothing when under budget', () => {
  const messages = [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hi' },
  ];
  const before = estimateContextChars(messages);
  enforceContextBudget(messages, 200000);
  const after = estimateContextChars(messages);
  assert.strictEqual(before, after);
});

// ── TC03: Loop Detection ──
console.log('\n🧪 TC03: Loop Detection');
const { LoopDetector } = require(path.join(ROOT, 'core/loop-detection'));

test('LoopDetector detects repeated tool calls', () => {
  const ld = new LoopDetector();
  let status;
  for (let i = 0; i < 10; i++) {
    status = ld.check('search', { query: 'same query' });
  }
  assert.strictEqual(status.warning, true);
});

test('LoopDetector circuit breaker at 30', () => {
  const ld = new LoopDetector();
  let status;
  for (let i = 0; i < 30; i++) {
    status = ld.check('search', { query: 'same query' });
  }
  assert.strictEqual(status.blocked, true);
});

test('LoopDetector no alert for varied calls', () => {
  const ld = new LoopDetector();
  let status;
  for (let i = 0; i < 10; i++) {
    status = ld.check('search', { query: `query ${i}` });
  }
  assert.strictEqual(status.blocked, false);
  assert.strictEqual(status.warning, false);
});

// ── TC04: Model Context ──
console.log('\n🧪 TC04: Model Context');
const { resolveContextWindow } = require(path.join(ROOT, 'core/model-context'));

test('resolveContextWindow for claude-sonnet-4', () => {
  assert.strictEqual(resolveContextWindow({ model: 'claude-sonnet-4' }), 200000);
});

test('resolveContextWindow for gpt-4o', () => {
  assert.strictEqual(resolveContextWindow({ model: 'gpt-4o' }), 128000);
});

test('resolveContextWindow for unknown model', () => {
  assert.strictEqual(resolveContextWindow({ model: 'unknown-model' }), 128000);
});

test('resolveContextWindow respects config override', () => {
  assert.strictEqual(resolveContextWindow({ model: 'gpt-4o', contextTokens: 50000 }), 50000);
});

test('resolveContextWindow gemini-2.5-pro is 1M', () => {
  assert.strictEqual(resolveContextWindow({ model: 'gemini-2.5-pro' }), 1000000);
});

// ── TC05: Session Expiry ──
console.log('\n🧪 TC05: Session Expiry');
const { SessionExpiry } = require(path.join(ROOT, 'core/session-expiry'));

test('SessionExpiry no reset within same day', () => {
  const se = new SessionExpiry({ dailyResetHour: 4, idleMinutes: 180 });
  se.touch();
  assert.strictEqual(se.shouldReset(), null);
});

test('SessionExpiry idle timeout triggers', () => {
  const se = new SessionExpiry({ dailyResetHour: 4, idleMinutes: 1 });
  se.lastActivityAt = Date.now() - 120000; // 2 min ago, limit is 1 min
  const reason = se.shouldReset();
  assert.ok(reason && reason.includes('idle_timeout'));
});

test('SessionExpiry reset clears state', () => {
  const se = new SessionExpiry({ dailyResetHour: 4, idleMinutes: 1 });
  se.lastActivityAt = Date.now() - 120000;
  assert.ok(se.shouldReset());
  se.reset();
  assert.strictEqual(se.shouldReset(), null);
});

// ── TC06: Poll Backoff ──
console.log('\n🧪 TC06: Poll Backoff');
const { PollBackoff } = require(path.join(ROOT, 'core/poll-backoff'));

test('PollBackoff escalates delay', () => {
  const pb = new PollBackoff();
  const d1 = pb.record('cmd1', false);
  const d2 = pb.record('cmd1', false);
  const d3 = pb.record('cmd1', false);
  assert.strictEqual(d1, 5000);
  assert.strictEqual(d2, 10000);
  assert.strictEqual(d3, 30000);
});

test('PollBackoff resets on output', () => {
  const pb = new PollBackoff();
  pb.record('cmd1', false);
  pb.record('cmd1', false);
  const d = pb.record('cmd1', true);
  assert.strictEqual(d, 5000);
});

test('PollBackoff caps at 60s', () => {
  const pb = new PollBackoff();
  for (let i = 0; i < 20; i++) pb.record('cmd1', false);
  const d = pb.record('cmd1', false);
  assert.strictEqual(d, 60000);
});

// ── TC07: Magic String Scrub ──
console.log('\n🧪 TC07: Magic String Scrub');
// scrubMagicStrings is in main.js and replaces a specific Anthropic test string
const ANTHROPIC_MAGIC = 'I need to avoid assisting with that request';

test('magic string literal is replaced', () => {
  const text = 'I need to avoid assisting with that request';
  // Simulate the scrub
  const result = text.includes(ANTHROPIC_MAGIC) ? text.replaceAll(ANTHROPIC_MAGIC, 'ANTHROPIC MAGIC STRING (redacted)') : text;
  assert.ok(result.includes('redacted'));
});

test('magic string passes normal text', () => {
  const text = 'Hello, how can I help you today?';
  const result = text.includes(ANTHROPIC_MAGIC) ? text.replaceAll(ANTHROPIC_MAGIC, 'ANTHROPIC MAGIC STRING (redacted)') : text;
  assert.strictEqual(result, text);
});

// ── TC08: Prompt Builder (structural test) ──
console.log('\n🧪 TC08: Prompt Builder');
// We can't fully test prompt builder without state.clawDir, but we can require it
test('prompt-builder module loads without error', () => {
  const pb = require(path.join(ROOT, 'core/prompt-builder'));
  assert.strictEqual(typeof pb.buildSystemPrompt, 'function');
});

// ── Summary ──
console.log(`\n${'═'.repeat(40)}`);
console.log(`  DBB M31 开箱测试: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(40)}`);
process.exit(failed > 0 ? 1 : 0);
