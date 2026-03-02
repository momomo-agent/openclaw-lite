// core/compaction.js — Context Compaction（含 LLM 摘要）
const COMPACT_THRESHOLD = 80000;
const COMPACT_KEEP_RECENT = 4;

function estimateTokens(text) {
  if (!text) return 0;
  if (typeof text === 'string') return Math.ceil(text.length / 3.5);
  if (Array.isArray(text)) return text.reduce((s, c) => s + estimateTokens(c.text || ''), 0);
  return 0;
}

function estimateMessagesTokens(messages) {
  return messages.reduce((s, m) => s + estimateTokens(m.content) + 10, 0);
}

async function compactHistory(messages, config, rawFn) {
  const keepCount = COMPACT_KEEP_RECENT * 2;
  if (messages.length <= keepCount + 2) return messages;

  const toSummarize = messages.slice(0, messages.length - keepCount);
  const toKeep = messages.slice(messages.length - keepCount);

  const transcript = toSummarize.map(m =>
    `[${m.role}]: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`
  ).join('\n').slice(0, 30000);

  const summaryPrompt = `Summarize this conversation concisely. Preserve: key decisions, TODOs, open questions, user preferences, file paths mentioned, and current task context. Output in the same language as the conversation.\n\n${transcript}`;

  try {
    const summary = await rawFn(
      [{ role: 'user', content: summaryPrompt }],
      'You are a conversation summarizer. Be concise but preserve all important context.',
      config
    );

    const compactedMessages = [
      { role: 'user', content: '[Previous conversation summary]' },
      { role: 'assistant', content: summary || 'No prior context.' },
      ...toKeep
    ];
    console.log(`[compaction] ${messages.length} msgs → ${compactedMessages.length} msgs (summarized ${toSummarize.length} msgs)`);
    return compactedMessages;
  } catch (e) {
    console.warn('[compaction] Failed, using truncation fallback:', e.message);
    return [
      { role: 'user', content: '[Earlier conversation was truncated due to length]' },
      { role: 'assistant', content: "Understood. I'll continue from the recent context." },
      ...toKeep
    ];
  }
}

module.exports = { COMPACT_THRESHOLD, COMPACT_KEEP_RECENT, estimateTokens, estimateMessagesTokens, compactHistory };
