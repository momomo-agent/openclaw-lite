// core/context-guard.js — Pre-flight context window guard
// OpenClaw-aligned: enforce total context < 75% of window before LLM call

const CONTEXT_INPUT_HEADROOM = 0.75;
const CHARS_PER_TOKEN = 4;

/**
 * Estimate total context chars from messages array.
 */
function estimateContextChars(messages) {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block && typeof block.text === 'string') total += block.text.length;
        else if (block && typeof block.content === 'string') total += block.content.length;
      }
    }
    // OpenAI tool_calls in assistant messages
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.function?.arguments) total += tc.function.arguments.length;
      }
    }
  }
  return total;
}

/**
 * Enforce context budget by compacting oldest tool results in-place.
 * Returns the (possibly modified) messages array.
 */
function enforceContextBudget(messages, contextWindowTokens) {
  const budgetChars = Math.max(1024, Math.floor(contextWindowTokens * CHARS_PER_TOKEN * CONTEXT_INPUT_HEADROOM));
  let currentChars = estimateContextChars(messages);

  if (currentChars <= budgetChars) return messages;

  // Compact oldest tool results first until under budget
  const PLACEHOLDER = '[compacted: tool output removed to free context]';
  for (let i = 0; i < messages.length && currentChars > budgetChars; i++) {
    const msg = messages[i];
    const isToolResult = msg.role === 'user' && Array.isArray(msg.content) &&
      msg.content.some(b => b.type === 'tool_result');
    const isOaiTool = msg.role === 'tool';

    if (isToolResult) {
      for (const block of msg.content) {
        if (block.type === 'tool_result' && typeof block.content === 'string' && block.content.length > PLACEHOLDER.length) {
          currentChars -= (block.content.length - PLACEHOLDER.length);
          block.content = PLACEHOLDER;
        }
      }
    } else if (isOaiTool && typeof msg.content === 'string' && msg.content.length > PLACEHOLDER.length) {
      currentChars -= (msg.content.length - PLACEHOLDER.length);
      msg.content = PLACEHOLDER;
    }
  }

  return messages;
}

module.exports = { enforceContextBudget, estimateContextChars };
