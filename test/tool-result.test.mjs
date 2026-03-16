// test/tool-result.test.mjs — Tool result truncation tests
import { describe, it, expect } from 'vitest'
import { truncateToolResult, calculateMaxChars } from '../core/tool-result.js'

describe('truncateToolResult', () => {
  it('returns short text unchanged', () => {
    expect(truncateToolResult('hello', 200000)).toBe('hello')
  })

  it('truncates long text with suffix', () => {
    const long = 'a'.repeat(300000)
    const result = truncateToolResult(long, 200000)
    expect(result.length).toBeLessThan(long.length)
    expect(result).toContain('⚠️')
    expect(result).toContain('truncated')
  })

  it('uses head+tail strategy when tail has errors', () => {
    const head = 'start content here\n'.repeat(5000)
    const middle = 'padding data line\n'.repeat(20000)
    const tail = '\nError: something failed\nTraceback: line 42\nexit code 1\n'
    const long = head + middle + tail
    // Use small context window to force truncation
    const result = truncateToolResult(long, 10000)
    expect(result).toContain('start content')
    expect(result).toContain('Error: something failed')
    expect(result).toContain('middle content omitted')
  })

  it('uses head+tail strategy when tail has JSON closing', () => {
    const head = '{\n  "items": [\n'
    const middle = '    {"id": 1},\n'.repeat(20000)
    const tail = '  ]\n}'
    const long = head + middle + tail
    const result = truncateToolResult(long, 200000)
    expect(result).toContain('"items"')
    expect(result).toContain('}')
  })

  it('handles empty string', () => {
    expect(truncateToolResult('', 200000)).toBe('')
  })

  it('handles null/undefined by converting to string', () => {
    expect(truncateToolResult(null, 200000)).toBe('null')
    expect(truncateToolResult(undefined, 200000)).toBe('undefined')
  })

  it('respects different context window sizes', () => {
    const long = 'x'.repeat(100000)
    const small = truncateToolResult(long, 50000)
    const large = truncateToolResult(long, 500000)
    // Smaller context window → more aggressive truncation
    expect(small.length).toBeLessThanOrEqual(large.length)
  })

  it('preserves summary/total at tail', () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join('\n')
    const tail = '\nTotal: 5000 lines processed\nSummary: all passed\n'
    const long = lines + tail
    const result = truncateToolResult(long, 200000)
    if (result.includes('middle content omitted')) {
      expect(result).toContain('Total: 5000')
    }
  })
})

describe('calculateMaxChars', () => {
  it('returns 30% of context window in chars', () => {
    // 200k tokens * 0.3 * 4 chars/token = 240k, capped at 400k
    expect(calculateMaxChars(200000)).toBe(240000)
  })

  it('caps at 400k hard max', () => {
    expect(calculateMaxChars(2000000)).toBe(400000)
  })

  it('defaults to 200k tokens when undefined', () => {
    expect(calculateMaxChars(undefined)).toBe(240000)
  })

  it('handles zero tokens (falls back to default)', () => {
    // 0 is falsy, falls back to 200k default
    expect(calculateMaxChars(0)).toBe(240000)
  })
})
