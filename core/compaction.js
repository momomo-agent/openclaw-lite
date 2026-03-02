// core/compaction.js — Context Compaction
const { loadConfig } = require('./config');

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

function estimateMessagesTokens(messages) {
  return messages.reduce((sum, m) => sum + estimateTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)), 0);
}

async function compactHistory(messages, config) {
  if (!config) config = loadConfig();
  const maxTokens = config.maxContextTokens || 100000;
  const currentTokens = estimateMessagesTokens(messages);
  if (currentTokens <= maxTokens) return messages;

  // Keep system + first 2 + last 10
  const keep = 12;
  if (messages.length <= keep) return messages;

  const first = messages.slice(0, 2);
  const last = messages.slice(-10);
  const dropped = messages.length - keep;

  return [
    ...first,
    { role: 'user', content: `[Context compacted: ${dropped} messages removed to save tokens]` },
    ...last
  ];
}

module.exports = { estimateTokens, estimateMessagesTokens, compactHistory };
