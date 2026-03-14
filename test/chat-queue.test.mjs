import { describe, it, expect, beforeEach } from 'vitest'

const { ChatQueue } = await import('../core/chat-queue.js')

describe('ChatQueue', () => {
  let q

  beforeEach(() => {
    q = new ChatQueue()
  })

  // ── Basic state ──

  it('starts idle', () => {
    expect(q.isActive('s1')).toBe(false)
    expect(q.depth('s1')).toBe(0)
  })

  it('enqueue returns false when idle (run immediately)', () => {
    expect(q.enqueue('s1', { prompt: 'hello' })).toBe(false)
  })

  it('enqueue returns true when active', () => {
    q.markActive('s1')
    expect(q.enqueue('s1', { prompt: 'hello' })).toBe(true)
    expect(q.depth('s1')).toBe(1)
  })

  it('multiple enqueues accumulate', () => {
    q.markActive('s1')
    q.enqueue('s1', { prompt: 'A' })
    q.enqueue('s1', { prompt: 'B' })
    q.enqueue('s1', { prompt: 'C' })
    expect(q.depth('s1')).toBe(3)
  })

  // ── shiftAll (collect drain) ──

  it('shiftAll returns all items and empties queue', () => {
    q.markActive('s1')
    q.enqueue('s1', { prompt: 'A' })
    q.enqueue('s1', { prompt: 'B' })
    q.enqueue('s1', { prompt: 'C' })
    const items = q.shiftAll('s1')
    expect(items).toHaveLength(3)
    expect(items.map(i => i.prompt)).toEqual(['A', 'B', 'C'])
    expect(q.depth('s1')).toBe(0)
    expect(q.shiftAll('s1')).toEqual([])
  })

  it('shiftAll on empty queue returns []', () => {
    expect(q.shiftAll('s1')).toEqual([])
  })

  it('shiftAll returns single item without wrapping', () => {
    q.markActive('s1')
    q.enqueue('s1', { prompt: 'only one' })
    const items = q.shiftAll('s1')
    expect(items).toHaveLength(1)
    expect(items[0].prompt).toBe('only one')
  })

  // ── Lifecycle ──

  it('markIdle makes enqueue return false again', () => {
    q.markActive('s1')
    q.enqueue('s1', { prompt: 'A' })
    q.markIdle('s1')
    expect(q.isActive('s1')).toBe(false)
    expect(q.enqueue('s1', { prompt: 'B' })).toBe(false)
  })

  it('clear removes all queued items', () => {
    q.markActive('s1')
    q.enqueue('s1', { prompt: 'A' })
    q.enqueue('s1', { prompt: 'B' })
    q.clear('s1')
    expect(q.depth('s1')).toBe(0)
    expect(q.shiftAll('s1')).toEqual([])
  })

  // ── Session isolation ──

  it('sessions are isolated', () => {
    q.markActive('s1')
    q.enqueue('s1', { prompt: 'A' })
    expect(q.isActive('s2')).toBe(false)
    expect(q.enqueue('s2', { prompt: 'B' })).toBe(false)
    expect(q.depth('s1')).toBe(1)
    expect(q.depth('s2')).toBe(0)
  })

  it('shiftAll only affects target session', () => {
    q.markActive('s1')
    q.markActive('s2')
    q.enqueue('s1', { prompt: 'A1' })
    q.enqueue('s1', { prompt: 'A2' })
    q.enqueue('s2', { prompt: 'B1' })
    const items = q.shiftAll('s1')
    expect(items.map(i => i.prompt)).toEqual(['A1', 'A2'])
    expect(q.depth('s2')).toBe(1) // untouched
  })

  it('status returns summary', () => {
    q.markActive('s1')
    q.enqueue('s1', { prompt: 'A' })
    expect(q.status('s1')).toEqual({ active: true, queued: 1 })
  })
})

// ── Collect prompt integration (drainAndMerge) ──

describe('drainAndMerge', () => {
  let q

  beforeEach(() => {
    q = new ChatQueue()
  })

  it('returns null when nothing queued', () => {
    q.markActive('s1')
    q.markIdle('s1')
    expect(q.drainAndMerge('s1')).toBeNull()
  })

  it('single message passes through unchanged', () => {
    q.markActive('s1')
    q.enqueue('s1', { prompt: 'hello', sessionId: 's1', requestId: 'r1' })
    const result = q.drainAndMerge('s1')
    expect(result.prompt).toBe('hello')
    expect(result.sessionId).toBe('s1')
    expect(result.userMessageSaved).toBeUndefined() // not wrapped
  })

  it('two messages produce collect format', () => {
    q.markActive('s1')
    q.enqueue('s1', { prompt: '你好', sessionId: 's1', requestId: 'r1' })
    q.enqueue('s1', { prompt: '帮我查天气', sessionId: 's1', requestId: 'r2' })
    const result = q.drainAndMerge('s1')
    expect(result.prompt).toContain('[Queued messages while agent was busy]')
    expect(result.prompt).toContain('Queued #1\n你好')
    expect(result.prompt).toContain('Queued #2\n帮我查天气')
    expect(result.prompt.match(/---/g)).toHaveLength(2)
    expect(result.userMessageSaved).toBe(true)
  })

  it('three messages are numbered correctly', () => {
    q.markActive('s1')
    q.enqueue('s1', { prompt: 'A' })
    q.enqueue('s1', { prompt: 'B' })
    q.enqueue('s1', { prompt: 'C' })
    const result = q.drainAndMerge('s1')
    expect(result.prompt).toContain('Queued #1\nA')
    expect(result.prompt).toContain('Queued #2\nB')
    expect(result.prompt).toContain('Queued #3\nC')
  })

  it('preserves multiline message content', () => {
    q.markActive('s1')
    q.enqueue('s1', { prompt: 'line 1\nline 2\nline 3' })
    q.enqueue('s1', { prompt: 'short' })
    const result = q.drainAndMerge('s1')
    expect(result.prompt).toContain('Queued #1\nline 1\nline 2\nline 3')
    expect(result.prompt).toContain('Queued #2\nshort')
  })

  it('inherits metadata from last queued item', () => {
    q.markActive('s1')
    q.enqueue('s1', { prompt: 'B', sessionId: 's1', requestId: 'r2', agentId: 'agent1' })
    q.enqueue('s1', { prompt: 'C', sessionId: 's1', requestId: 'r3', agentId: 'agent2' })
    const result = q.drainAndMerge('s1')
    expect(result.sessionId).toBe('s1')
    expect(result.requestId).toBe('r3')
    expect(result.agentId).toBe('agent2')
    expect(result.userMessageSaved).toBe(true)
  })

  it('empties queue after drain', () => {
    q.markActive('s1')
    q.enqueue('s1', { prompt: 'A' })
    q.enqueue('s1', { prompt: 'B' })
    q.drainAndMerge('s1')
    expect(q.depth('s1')).toBe(0)
    expect(q.drainAndMerge('s1')).toBeNull()
  })
})

// ── Full drain simulation ──

describe('Drain simulation (queue → collect → run)', () => {
  it('simulates full A→B→C drain cycle', () => {
    const q = new ChatQueue()
    const runs = []

    function runChat(item) {
      runs.push(item.prompt)
    }

    // 1. User sends A — not queued (idle)
    expect(q.enqueue('s1', { prompt: 'A' })).toBe(false)
    q.markActive('s1')
    runChat({ prompt: 'A' })

    // 2. User sends B while A is processing — queued
    expect(q.enqueue('s1', { prompt: 'B', sessionId: 's1', requestId: 'r2' })).toBe(true)

    // 3. User sends C while A is still processing — queued
    expect(q.enqueue('s1', { prompt: 'C', sessionId: 's1', requestId: 'r3' })).toBe(true)

    expect(q.depth('s1')).toBe(2)

    // 4. A finishes — drain B+C as one collect
    q.markIdle('s1')
    const merged = q.drainAndMerge('s1')
    expect(merged).not.toBeNull()
    runChat(merged)

    expect(runs).toHaveLength(2) // A (direct) + BC (collected)
    expect(runs[0]).toBe('A')
    expect(runs[1]).toContain('[Queued messages while agent was busy]')
    expect(runs[1]).toContain('Queued #1\nB')
    expect(runs[1]).toContain('Queued #2\nC')
    expect(q.depth('s1')).toBe(0)
  })

  it('single queued message is not wrapped in collect format', () => {
    const q = new ChatQueue()

    q.markActive('s1')
    q.enqueue('s1', { prompt: 'only B' })

    q.markIdle('s1')
    const merged = q.drainAndMerge('s1')

    expect(merged?.prompt).toBe('only B')
  })
})
