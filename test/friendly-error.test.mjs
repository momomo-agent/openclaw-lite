/**
 * test/friendly-error.test.mjs — Tests for friendlyError() message sanitization
 */
import { describe, it, expect } from 'vitest'

// Extract friendlyError logic (same as in main.js)
function friendlyError(err) {
  let msg = typeof err === 'string' ? err : err?.message || 'Unknown error'
  msg = msg.replace(/^Error invoking remote method '[^']+': Error: /i, '')
  msg = msg.replace(/^Error: /i, '')

  const lower = msg.toLowerCase()

  if (lower.includes('no api key') || lower.includes('api key')) {
    return { short: 'No API key', detail: 'Go to Settings (⚙️) to configure your API key.', category: 'config' }
  }
  if (lower.includes('401') || lower.includes('unauthorized')) {
    return { short: 'Invalid API key', detail: 'Your API key was rejected. Check Settings (⚙️) to update it.', category: 'auth' }
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many')) {
    return { short: 'Rate limited', detail: 'Too many requests. Wait a moment and try again.', category: 'rate-limit' }
  }
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('etimedout')) {
    return { short: 'Request timed out', detail: 'The server took too long to respond. Try again.', category: 'network' }
  }
  if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('network') || lower.includes('fetch failed')) {
    return { short: 'Network error', detail: 'Could not reach the API server. Check your internet connection.', category: 'network' }
  }
  if (lower.includes('overloaded') || lower.includes('529') || lower.includes('503') || lower.includes('server error')) {
    return { short: 'Server overloaded', detail: 'The API server is temporarily overloaded. Try again in a few seconds.', category: 'server' }
  }
  if (lower.includes('context') && lower.includes('long')) {
    return { short: 'Context too long', detail: 'The conversation is too long for the model. Start a new chat or compact the history.', category: 'context' }
  }
  if (lower.includes('not available') || lower.includes('not found')) {
    return { short: 'Service unavailable', detail: msg, category: 'unavailable' }
  }

  return { short: msg.length > 80 ? msg.slice(0, 77) + '…' : msg, detail: msg, category: 'unknown' }
}

describe('friendlyError', () => {
  it('strips IPC wrapper from error message', () => {
    const result = friendlyError("Error invoking remote method 'chat': Error: No API key configured")
    expect(result.short).toBe('No API key')
    expect(result.category).toBe('config')
  })

  it('handles API key missing', () => {
    const result = friendlyError('No API key configured. Click ⚙️ to set up.')
    expect(result.short).toBe('No API key')
    expect(result.detail).toContain('Settings')
  })

  it('handles 401 unauthorized', () => {
    const result = friendlyError('API 401: Unauthorized')
    expect(result.short).toBe('Invalid API key')
    expect(result.category).toBe('auth')
  })

  it('handles rate limit (429)', () => {
    const result = friendlyError('API 429: rate limit exceeded')
    expect(result.short).toBe('Rate limited')
    expect(result.category).toBe('rate-limit')
  })

  it('handles rate limit (text)', () => {
    const result = friendlyError('Too many requests, please slow down')
    expect(result.short).toBe('Rate limited')
  })

  it('handles timeout', () => {
    const result = friendlyError('Request timed out after 30s')
    expect(result.short).toBe('Request timed out')
    expect(result.category).toBe('network')
  })

  it('handles ETIMEDOUT', () => {
    const result = friendlyError('connect ETIMEDOUT 104.18.0.1:443')
    expect(result.short).toBe('Request timed out')
  })

  it('handles connection refused', () => {
    const result = friendlyError('connect ECONNREFUSED 127.0.0.1:443')
    expect(result.short).toBe('Network error')
    expect(result.category).toBe('network')
  })

  it('handles DNS failure', () => {
    const result = friendlyError('getaddrinfo ENOTFOUND api.anthropic.com')
    expect(result.short).toBe('Network error')
  })

  it('handles fetch failed', () => {
    const result = friendlyError('fetch failed')
    expect(result.short).toBe('Network error')
  })

  it('handles server overloaded (529)', () => {
    const result = friendlyError('API 529: overloaded')
    expect(result.short).toBe('Server overloaded')
    expect(result.category).toBe('server')
  })

  it('handles context too long', () => {
    const result = friendlyError('prompt is too long: context window exceeded')
    expect(result.short).toBe('Context too long')
    expect(result.category).toBe('context')
  })

  it('handles service not available', () => {
    const result = friendlyError("coding agent 'codex' not available")
    expect(result.short).toBe('Service unavailable')
    expect(result.category).toBe('unavailable')
  })

  it('truncates long unknown errors', () => {
    const longMsg = 'x'.repeat(200)
    const result = friendlyError(longMsg)
    expect(result.short.length).toBeLessThanOrEqual(80)
    expect(result.short).toContain('…')
    expect(result.category).toBe('unknown')
  })

  it('handles Error objects', () => {
    const result = friendlyError(new Error('Network error occurred'))
    expect(result.short).toBe('Network error')
  })

  it('handles null/undefined', () => {
    const result = friendlyError(null)
    expect(result.short).toBe('Unknown error')
  })

  it('strips Error: prefix', () => {
    const result = friendlyError('Error: something broke')
    expect(result.short).toBe('something broke')
    expect(result.short.startsWith('Error:')).toBe(false)
  })
})
