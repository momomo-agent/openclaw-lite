// core/transcript-repair.js — Session transcript sanitization
// OpenClaw-aligned: turn validation + tool pairing + orphan user fix

/**
 * Ensure Anthropic-compatible turn ordering: user/assistant must strictly alternate.
 * Removes consecutive same-role messages (keeps last).
 */
function validateAnthropicTurns(messages) {
  if (!messages || messages.length <= 1) return messages;
  const result = [messages[0]];
  for (let i = 1; i < messages.length; i++) {
    const prev = result[result.length - 1];
    const curr = messages[i];
    // Allow consecutive tool_result (role=user) after assistant with tool_use
    if (curr.role === prev.role && curr.role !== 'user') {
      // Consecutive assistant — merge or keep last
      result[result.length - 1] = curr;
    } else {
      result.push(curr);
    }
  }
  return result;
}

/**
 * Repair orphaned tool_result messages.
 * After history truncation, a tool_result may exist without a matching tool_use.
 * Remove such orphans to prevent API errors.
 */
function repairToolUseResultPairing(messages) {
  if (!messages || messages.length === 0) return messages;

  // Collect all tool_use IDs from assistant messages
  const toolUseIds = new Set();
  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'tool_use' && block.id) toolUseIds.add(block.id);
      }
    }
    // OpenAI format
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        if (tc.id) toolUseIds.add(tc.id);
      }
    }
  }

  // Filter out orphaned tool results
  return messages.filter(msg => {
    // Anthropic format: user message with tool_result content
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      const toolResults = msg.content.filter(b => b.type === 'tool_result');
      if (toolResults.length > 0) {
        // Keep only if at least one tool_result has a matching tool_use
        const hasMatch = toolResults.some(b => toolUseIds.has(b.tool_use_id));
        if (!hasMatch) return false;
      }
    }
    // OpenAI format: role=tool
    if (msg.role === 'tool' && msg.tool_call_id) {
      return toolUseIds.has(msg.tool_call_id);
    }
    return true;
  });
}

/**
 * Remove orphaned trailing user message.
 * If the last message is a user message (not from the current prompt),
 * it would cause consecutive user turns. Remove it.
 */
function removeOrphanedTrailingUser(messages) {
  if (!messages || messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (last.role === 'user') {
    return messages.slice(0, -1);
  }
  return messages;
}

/**
 * Limit history to last N user turns (and their associated responses).
 * OpenClaw-aligned: keeps recent context, drops oldest.
 */
function limitHistoryTurns(messages, limit) {
  if (!limit || limit <= 0 || !messages || messages.length === 0) return messages;

  let userCount = 0;
  let cutIndex = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      userCount++;
      if (userCount > limit) {
        cutIndex = i + 1;
        break;
      }
    }
  }

  if (cutIndex > 0) {
    return messages.slice(cutIndex);
  }
  return messages;
}

/**
 * Full transcript sanitization pipeline.
 * Call before sending messages to LLM.
 */
function sanitizeTranscript(messages, opts = {}) {
  let result = messages;

  // 1. Limit history turns
  if (opts.historyLimit) {
    result = limitHistoryTurns(result, opts.historyLimit);
  }

  // 2. Repair tool_use/tool_result pairing (after truncation)
  result = repairToolUseResultPairing(result);

  // 3. Remove orphaned trailing user
  if (opts.removeTrailingUser !== false) {
    result = removeOrphanedTrailingUser(result);
  }

  // 4. Validate Anthropic turn ordering
  if (opts.provider === 'anthropic') {
    result = validateAnthropicTurns(result);
  }

  return result;
}

module.exports = {
  validateAnthropicTurns,
  repairToolUseResultPairing,
  removeOrphanedTrailingUser,
  limitHistoryTurns,
  sanitizeTranscript,
};
