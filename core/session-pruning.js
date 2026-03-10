// core/session-pruning.js — Trim old tool results before LLM call (in-memory only)
// OpenClaw-aligned: soft-trim (head+tail) + hard-clear dual-level strategy

const PRUNE_KEEP_RECENT = 3;           // Keep last N assistant messages' tool results intact
const SOFT_TRIM_THRESHOLD = 4000;      // Soft-trim results > this many chars
const SOFT_TRIM_HEAD = 1500;           // Keep first N chars
const SOFT_TRIM_TAIL = 1500;           // Keep last N chars
const HARD_CLEAR_RATIO = 0.5;          // Hard-clear results in oldest 50% of messages
const HARD_CLEAR_PLACEHOLDER = '[Old tool result content cleared]';
const MIN_PRUNABLE_CHARS = 50000;      // Don't prune results smaller than this (OpenClaw default)
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (Anthropic cache TTL)

/**
 * Prune old tool results from messages before sending to LLM.
 * Two-level strategy matching OpenClaw:
 * 1. Hard-clear: oldest messages get tool results completely replaced
 * 2. Soft-trim: middle messages get head+tail preserved
 * 3. Recent messages: untouched
 *
 * Cache-TTL mode: only prune when cache has expired (Anthropic prompt caching)
 * @param {object} [opts] - { lastCallTime, provider }
 */
function pruneToolResults(messages, opts = {}) {
  if (!messages || messages.length <= PRUNE_KEEP_RECENT * 2) return messages;

  // Cache-TTL mode: skip pruning if within TTL window
  if (opts.lastCallTime && opts.provider === 'anthropic') {
    const elapsed = Date.now() - opts.lastCallTime;
    if (elapsed < DEFAULT_CACHE_TTL_MS) return messages;
  }

  // Count assistant messages to find cutoff points
  let assistantCount = 0;
  const assistantIndices = [];
  messages.forEach((m, i) => {
    if (m.role === 'assistant') { assistantCount++; assistantIndices.push(i); }
  });

  if (assistantCount <= PRUNE_KEEP_RECENT) return messages;

  const hardClearCutoff = assistantIndices[Math.floor(assistantCount * HARD_CLEAR_RATIO)] || 0;
  const softTrimCutoff = assistantIndices[assistantCount - PRUNE_KEEP_RECENT] || messages.length;

  return messages.map((msg, i) => {
    // Recent messages: keep intact
    if (i >= softTrimCutoff) return msg;

    // Anthropic format: tool_result in user messages as array content
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      const hasToolResult = msg.content.some(c => c.type === 'tool_result');
      if (!hasToolResult) return msg;

      const prunedContent = msg.content.map(c => {
        if (c.type !== 'tool_result') return c;
        // Skip image blocks
        if (Array.isArray(c.content) && c.content.some(b => b.type === 'image')) return c;
        const text = typeof c.content === 'string' ? c.content : JSON.stringify(c.content);
        if (text.length < MIN_PRUNABLE_CHARS) return c;

        if (i < hardClearCutoff) {
          // Hard-clear zone
          return { ...c, content: HARD_CLEAR_PLACEHOLDER };
        }
        // Soft-trim zone
        if (text.length <= SOFT_TRIM_THRESHOLD) return c;
        return {
          ...c,
          content: text.slice(0, SOFT_TRIM_HEAD) + `\n...[${text.length - SOFT_TRIM_HEAD - SOFT_TRIM_TAIL} chars omitted]...\n` + text.slice(-SOFT_TRIM_TAIL)
        };
      });
      return { ...msg, content: prunedContent };
    }

    // OpenAI format: role=tool messages
    if (msg.role === 'tool' && typeof msg.content === 'string') {
      if (msg.content.length < MIN_PRUNABLE_CHARS) return msg;

      if (i < hardClearCutoff) {
        return { ...msg, content: HARD_CLEAR_PLACEHOLDER };
      }
      if (msg.content.length <= SOFT_TRIM_THRESHOLD) return msg;
      return {
        ...msg,
        content: msg.content.slice(0, SOFT_TRIM_HEAD) + `\n...[${msg.content.length - SOFT_TRIM_HEAD - SOFT_TRIM_TAIL} chars omitted]...\n` + msg.content.slice(-SOFT_TRIM_TAIL)
      };
    }

    return msg;
  });
}

module.exports = { pruneToolResults, PRUNE_KEEP_RECENT, SOFT_TRIM_THRESHOLD, HARD_CLEAR_PLACEHOLDER };
