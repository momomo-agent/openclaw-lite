// core/compaction.js — Context Compaction（含 LLM 摘要 + 模型感知 + memory flush）
// OpenClaw-aligned: dynamic threshold based on model context window

// Model context windows (tokens) — conservative estimates
const MODEL_CONTEXT_WINDOWS = {
  // Anthropic
  'claude-sonnet-4-20250514': 200000,
  'claude-opus-4-20250514': 200000,
  'claude-3-5-sonnet-20241022': 200000,
  'claude-3-haiku-20240307': 200000,
  // OpenAI
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'o1': 200000,
  'o3': 200000,
  'o3-mini': 200000,
  'o4-mini': 200000,
};

// Trigger compaction when context reaches this fraction of the model's window
const COMPACT_TRIGGER_RATIO = 0.75;
// Fallback threshold when model is unknown
const COMPACT_THRESHOLD_FALLBACK = 80000;
const COMPACT_KEEP_RECENT = 4;
// Reserve tokens for response
const RESPONSE_RESERVE = 4096;

function getContextWindowForModel(model) {
  if (!model) return null;
  const normalized = model.toLowerCase();
  // Exact match first
  if (MODEL_CONTEXT_WINDOWS[normalized]) return MODEL_CONTEXT_WINDOWS[normalized];
  // Prefix match (e.g., 'claude-sonnet-4' matches 'claude-sonnet-4-20250514')
  for (const [key, val] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (normalized.startsWith(key.split('-').slice(0, -1).join('-')) ||
        key.startsWith(normalized)) {
      return val;
    }
  }
  // Heuristic: if model name contains 'claude', assume 200k; 'gpt', assume 128k
  if (normalized.includes('claude')) return 200000;
  if (normalized.includes('gpt') || normalized.includes('o1') || normalized.includes('o3')) return 128000;
  return null;
}

function getCompactThreshold(model) {
  const window = getContextWindowForModel(model);
  if (window) return Math.floor((window - RESPONSE_RESERVE) * COMPACT_TRIGGER_RATIO);
  return COMPACT_THRESHOLD_FALLBACK;
}

function estimateTokens(text) {
  if (!text) return 0;
  if (typeof text === 'string') return Math.ceil(text.length / 3.5);
  if (Array.isArray(text)) return text.reduce((s, c) => s + estimateTokens(c.text || ''), 0);
  return 0;
}

function estimateMessagesTokens(messages) {
  return messages.reduce((s, m) => s + estimateTokens(m.content) + 10, 0);
}

/**
 * Memory flush turn — ask the model to write durable notes before compaction.
 * This is a silent turn (not shown to user) that gives the model a chance
 * to persist important context to memory files before history is compressed.
 */
async function memoryFlushTurn(messages, config, rawFn) {
  const flushPrompt = `Before this conversation is compacted, write any important context, decisions, or TODOs to memory files using memory tools. If there's nothing critical to save, say "Nothing to flush." Be brief.`;

  try {
    const result = await rawFn(
      [...messages.slice(-8), { role: 'user', content: flushPrompt }],
      'You are about to have your conversation history compacted. Save any critical context to memory files now.',
      { ...config, maxTokens: 500 }
    );
    console.log(`[compaction] memory flush: ${(result || '').slice(0, 100)}`);
  } catch (e) {
    console.warn('[compaction] memory flush failed (non-blocking):', e.message);
  }
}

async function compactHistory(messages, config, rawFn, opts = {}) {
  const keepCount = COMPACT_KEEP_RECENT * 2;
  if (messages.length <= keepCount + 2) return messages;

  // Memory flush before compaction (unless disabled)
  if (opts.memoryFlush !== false) {
    await memoryFlushTurn(messages, config, rawFn);
  }

  const toSummarize = messages.slice(0, messages.length - keepCount);
  const toKeep = messages.slice(messages.length - keepCount);

  const transcript = toSummarize.map(m =>
    `[${m.role}]: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`
  ).join('\n').slice(0, 30000);

  const summaryPrompt = `Summarize this conversation concisely. Preserve: key decisions, TODOs, open questions, user preferences, file paths mentioned, and current task context. IMPORTANT: Preserve all identifiers verbatim — file paths, commit hashes, URLs, session IDs, variable names, and any opaque strings. Do not paraphrase or generalize identifiers. Output in the same language as the conversation.\n\n${transcript}`;

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

module.exports = {
  COMPACT_THRESHOLD_FALLBACK,
  COMPACT_KEEP_RECENT,
  estimateTokens,
  estimateMessagesTokens,
  compactHistory,
  getCompactThreshold,
  getContextWindowForModel
};
