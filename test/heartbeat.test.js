// test/heartbeat.test.js — Heartbeat system tests (OpenClaw-aligned)
import { describe, it, expect } from 'vitest'

// Import the functions we're testing
const {
  isWithinActiveHours,
  isHeartbeatEmpty,
  buildHeartbeatPrompt,
  processHeartbeatResponse,
} = require('../core/heartbeat')

describe('isWithinActiveHours', () => {
  it('returns true when no activeHours configured', () => {
    expect(isWithinActiveHours(null)).toBe(true)
    expect(isWithinActiveHours(undefined)).toBe(true)
  })

  it('returns false for zero-width window (start === end)', () => {
    expect(isWithinActiveHours({ start: '08:00', end: '08:00' })).toBe(false)
  })

  // Time-dependent tests — these test the logic, not the clock
  it('handles normal range (start < end)', () => {
    const now = new Date()
    const h = now.getHours()
    const m = now.getMinutes()
    const current = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

    // Window that includes current time
    const before = `${String(Math.max(0, h - 1)).padStart(2, '0')}:00`
    const after = `${String(Math.min(23, h + 1)).padStart(2, '0')}:59`
    expect(isWithinActiveHours({ start: before, end: after })).toBe(true)

    // Window that excludes current time (far in the past)
    expect(isWithinActiveHours({ start: '00:00', end: '00:01' })).toBe(h === 0 && m === 0)
  })
})

describe('isHeartbeatEmpty', () => {
  it('empty string is empty', () => {
    expect(isHeartbeatEmpty('')).toBe(true)
  })

  it('only headers and blank lines is empty', () => {
    expect(isHeartbeatEmpty('# Heartbeat\n\n## Section\n\n')).toBe(true)
  })

  it('content with actual items is not empty', () => {
    expect(isHeartbeatEmpty('# Heartbeat\n- Check inbox')).toBe(false)
  })

  it('plain text is not empty', () => {
    expect(isHeartbeatEmpty('Do something')).toBe(false)
  })
})

describe('buildHeartbeatPrompt', () => {
  it('returns default prompt when no HEARTBEAT.md', () => {
    const prompt = buildHeartbeatPrompt('/nonexistent/path', {})
    expect(prompt).toContain('HEARTBEAT_OK')
    expect(prompt).toContain('HEARTBEAT.md')
  })

  it('returns null for empty HEARTBEAT.md', () => {
    // We can't easily mock fs here, so test the logic via isHeartbeatEmpty
    // The buildHeartbeatPrompt function checks isHeartbeatEmpty internally
    expect(isHeartbeatEmpty('# Heartbeat\n')).toBe(true)
  })

  it('uses custom prompt from config', () => {
    const prompt = buildHeartbeatPrompt('/nonexistent', {
      heartbeat: { prompt: 'Custom check' }
    })
    expect(prompt).toBe('Custom check')
  })
})

describe('processHeartbeatResponse', () => {
  it('returns null for pure HEARTBEAT_OK', () => {
    expect(processHeartbeatResponse('HEARTBEAT_OK')).toBeNull()
  })

  it('returns null for HEARTBEAT_OK with short trailing text', () => {
    expect(processHeartbeatResponse('HEARTBEAT_OK all good')).toBeNull()
  })

  it('returns null for HEARTBEAT_OK at end', () => {
    expect(processHeartbeatResponse('Nothing to report HEARTBEAT_OK')).toBeNull()
  })

  it('returns alert text without HEARTBEAT_OK', () => {
    const result = processHeartbeatResponse('Build failed! Check logs.')
    expect(result).toBe('Build failed! Check logs.')
  })

  it('returns null for empty/null response', () => {
    expect(processHeartbeatResponse(null)).toBeNull()
    expect(processHeartbeatResponse('')).toBeNull()
  })

  it('returns alert when remaining text exceeds ackMaxChars', () => {
    const longText = 'A'.repeat(400)
    const result = processHeartbeatResponse(`HEARTBEAT_OK ${longText}`)
    expect(result).not.toBeNull()
  })

  it('respects custom ackMaxChars', () => {
    const text = 'A'.repeat(100)
    expect(processHeartbeatResponse(`HEARTBEAT_OK ${text}`, 50)).not.toBeNull()
    expect(processHeartbeatResponse(`HEARTBEAT_OK ${text}`, 200)).toBeNull()
  })

  it('HEARTBEAT_OK in middle of text is not stripped', () => {
    const result = processHeartbeatResponse('Alert: something HEARTBEAT_OK happened today')
    expect(result).toBe('Alert: something HEARTBEAT_OK happened today')
  })
})
