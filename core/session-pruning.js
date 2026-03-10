// core/session-pruning.js — Trim old tool results before LLM call (in-memory only)
// OpenClaw-aligned: keeps recent tool results intact, truncates old ones

const PRUNE_KEEP_RECENT = 6;      // Keep last N messages' tool results intact
const PRUNE_MAX_TOOL_CHARS = 200; // Truncated tool result max chars

/**
 * Prune old tool results from messages before sending to LLM.
 * Does NOT mutate the original array — returns a new array.
 * Recent messages keep full tool results; old ones get truncated.
 *
 * @param {Array} messages - Conversation messages
 * @returns {Array} - Pruned messages (new array, originals untouched)
 */
function pruneToolResults(messages) {
  if (!messages || messages.length <= PRUNE_KEEP_RECENT) return messages;

  const cutoff = messages.length - PRUNE_KEEP_RECENT;

  return messages.map((msg, i) => {
    if (i >= cutoff) return msg; // Keep recent messages intact

    // Anthropic format: tool_result in user messages as array content
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      const hasToolResult = msg.content.some(c => c.type === 'tool_result');
      if (!hasToolResult) return msg;

      const prunedContent = msg.content.map(c => {
        if (c.type !== 'tool_result') return c;
        const text = typeof c.content === 'string' ? c.content : JSON.stringify(c.content);
        if (text.length <= PRUNE_MAX_TOOL_CHARS) return c;
        return {
          ...c,
          content: text.slice(0, PRUNE_MAX_TOOL_CHARS) + `\n...[truncated, was ${text.length} chars]`
        };
      });
      return { ...msg, content: prunedContent };
    }

    // OpenAI format: role=tool messages
    if (msg.role === 'tool' && typeof msg.content === 'string') {
      if (msg.content.length <= PRUNE_MAX_TOOL_CHARS) return msg;
      return {
        ...msg,
        content: msg.content.slice(0, PRUNE_MAX_TOOL_CHARS) + `\n...[truncated, was ${msg.content.length} chars]`
      };
    }

    // Also prune assistant tool_use input (large JSON inputs)
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const hasToolUse = msg.content.some(c => c.type === 'tool_use');
      if (!hasToolUse) return msg;

      const prunedContent = msg.content.map(c => {
        if (c.type !== 'tool_use') return c;
        const inputStr = JSON.stringify(c.input || {});
        if (inputStr.length <= PRUNE_MAX_TOOL_CHARS * 2) return c;
        // Keep tool name and id, truncate large inputs
        return c; // Don't prune tool_use inputs — they're needed for pairing
      });
      return { ...msg, content: prunedContent };
    }

    return msg;
  });
}

module.exports = { pruneToolResults, PRUNE_KEEP_RECENT, PRUNE_MAX_TOOL_CHARS };
