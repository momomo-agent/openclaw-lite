// core/error-classify.js — API error classification
// OpenClaw-aligned

// Anthropic magic string scrub — prevent refusal test injection
const ANTHROPIC_MAGIC = 'ANTHROPIC_MAGIC_STRING_TRIGGER_REFUSAL'

function scrubMagicStrings(text) {
  if (!text || !text.includes(ANTHROPIC_MAGIC)) return text
  return text.replaceAll(ANTHROPIC_MAGIC, 'ANTHROPIC MAGIC STRING (redacted)')
}

function isContextOverflowError(status, body) {
  if (status === 400) {
    const lower = (body || '').toLowerCase()
    return lower.includes('context') || lower.includes('too many tokens') ||
      lower.includes('maximum context length') || lower.includes('prompt is too long')
  }
  return false
}

function isBillingError(status, body) {
  return status === 402 || (status === 400 && (body || '').toLowerCase().includes('billing'))
}

function friendlyError(err) {
  if (!err) return { short: 'Error', detail: 'Unknown error', category: 'unknown' }
  const msg = err?.message || String(err) || ''
  const lower = msg.toLowerCase()

  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('invalid.*key')) {
    return { short: 'Invalid API key', detail: 'Your API key was rejected. Check Settings to update it.', category: 'auth' }
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many')) {
    return { short: 'Rate limited', detail: 'Too many requests. Wait a moment and try again.', category: 'rate-limit' }
  }
  if (lower.includes('billing') || lower.includes('402')) {
    return { short: 'Billing error', detail: 'Check your API account balance.', category: 'billing' }
  }
  if (lower.includes('overloaded') || lower.includes('503') || lower.includes('529')) {
    return { short: 'Server overloaded', detail: 'The API server is temporarily overloaded. Try again in a few seconds.', category: 'server' }
  }
  if (lower.includes('timeout') || lower.includes('econnreset') || lower.includes('socket hang up')) {
    return { short: 'Request timed out', detail: 'The server took too long to respond. Try again.', category: 'network' }
  }
  if (lower.includes('context') && lower.includes('length')) {
    return { short: 'Context too long', detail: 'The conversation is too long. Start a new chat or compact the history.', category: 'context' }
  }
  if (lower.includes('enotfound') || lower.includes('econnrefused')) {
    return { short: 'Network error', detail: 'Could not reach the API server. Check your internet connection.', category: 'network' }
  }

  // Strip noise
  let clean = msg
    .replace(/^Error invoking remote method '[^']+': Error: /i, '')
    .replace(/^Error: /i, '')
    .replace(/^Error invoking remote method '[^']+': /i, '')
  if (clean.length > 200) clean = clean.slice(0, 200) + '…'
  return { short: clean.length > 80 ? clean.slice(0, 77) + '…' : clean, detail: clean, category: 'unknown' }
}

module.exports = { scrubMagicStrings, isContextOverflowError, isBillingError, friendlyError }
