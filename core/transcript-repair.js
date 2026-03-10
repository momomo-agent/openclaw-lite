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
  if (!messages || messages.length <= 1) return messages;
  const last = messages[messages.length - 1];
  // Only remove if there's an assistant message in history (not just user→user)
  const hasAssistant = messages.some(m => m.role === 'assistant');
  if (last.role === 'user' && hasAssistant) {
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
 * Sanitize empty/whitespace-only text content blocks.
 * OpenAI (and some Anthropic-compatible endpoints) reject messages
 * where text blocks contain only whitespace.
 * - For string content: replace empty with a space placeholder
 * - For array content: remove empty text blocks; if none remain, add placeholder
 */
function sanitizeEmptyTextBlocks(messages) {
  let touched = false;
  const out = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') { out.push(msg); continue; }

    // String content (simple messages)
    if (typeof msg.content === 'string') {
      if (!msg.content.trim()) {
        touched = true;
        out.push({ ...msg, content: '(empty)' });
      } else {
        out.push(msg);
      }
      continue;
    }

    // Array content (structured blocks)
    if (Array.isArray(msg.content)) {
      let changed = false;
      const nextContent = [];
      for (const block of msg.content) {
        if (block && typeof block === 'object' && block.type === 'text') {
          if (typeof block.text !== 'string' || !block.text.trim()) {
            // Skip empty text blocks if there are other non-text blocks
            changed = true;
            continue;
          }
        }
        nextContent.push(block);
      }
      if (changed) {
        touched = true;
        // If all content was removed, add a placeholder
        if (nextContent.length === 0) {
          nextContent.push({ type: 'text', text: '(empty)' });
        }
        out.push({ ...msg, content: nextContent });
      } else {
        out.push(msg);
      }
      continue;
    }

    out.push(msg);
  }
  return touched ? out : messages;
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

  // 4. Drop thinking blocks from assistant messages (OpenClaw-aligned)
  result = dropThinkingBlocks(result);

  // 5. Prune image payloads from already-processed user messages (OpenClaw-aligned)
  pruneProcessedHistoryImages(result);

  // 6. Sanitize empty text blocks (prevents OpenAI 400 errors)
  result = sanitizeEmptyTextBlocks(result);

  // 7. Validate Anthropic turn ordering
  if (opts.provider === 'anthropic') {
    result = validateAnthropicTurns(result);
  }

  return result;
}

const PRUNED_IMAGE_MARKER = '[image data removed - already processed by model]';

/**
 * Drop thinking blocks from assistant messages.
 * Some providers reject persisted thinking blocks on re-send.
 */
function dropThinkingBlocks(messages) {
  let touched = false;
  const out = [];
  for (const msg of messages) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) {
      out.push(msg);
      continue;
    }
    const nextContent = [];
    let changed = false;
    for (const block of msg.content) {
      if (block && typeof block === 'object' && block.type === 'thinking') {
        touched = true;
        changed = true;
        continue;
      }
      nextContent.push(block);
    }
    if (!changed) { out.push(msg); continue; }
    const content = nextContent.length > 0 ? nextContent : [{ type: 'text', text: '(thinking removed)' }];
    out.push({ ...msg, content });
  }
  return touched ? out : messages;
}

/**
 * Replace image blocks in already-answered user messages with a text marker.
 * Saves context tokens on re-send. Mutates in-place, returns true if changed.
 */
function pruneProcessedHistoryImages(messages) {
  let lastAssistantIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') { lastAssistantIndex = i; break; }
  }
  if (lastAssistantIndex < 0) return false;

  let didMutate = false;
  for (let i = 0; i < lastAssistantIndex; i++) {
    const msg = messages[i];
    if (!msg || msg.role !== 'user' || !Array.isArray(msg.content)) continue;
    for (let j = 0; j < msg.content.length; j++) {
      const block = msg.content[j];
      if (block && typeof block === 'object' && block.type === 'image') {
        msg.content[j] = { type: 'text', text: PRUNED_IMAGE_MARKER };
        didMutate = true;
      }
    }
  }
  return didMutate;
}

module.exports = {
  validateAnthropicTurns,
  repairToolUseResultPairing,
  removeOrphanedTrailingUser,
  limitHistoryTurns,
  dropThinkingBlocks,
  pruneProcessedHistoryImages,
  sanitizeEmptyTextBlocks,
  sanitizeTranscript,
  PRUNED_IMAGE_MARKER,
};
