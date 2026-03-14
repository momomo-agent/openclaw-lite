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

  // ── shift (single) ──

  it('shift returns items in FIFO order', () => {
    q.markActive('s1')
    q.enqueue('s1', { prompt: 'A' })
    q.enqueue('s1', { prompt: 'B' })
    expect(q.shift('s1').prompt).toBe('A')
    expect(q.shift('s1').prompt).toBe('B')
    expect(q.shift('s1')).toBeNull()
  })

  // ── shiftAll (collect) ──

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
    expect(q.shift('s1')).toBeNull()
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

  // ── Drain tracking ──

  it('drain tracking works', () => {
    expect(q.isDraining('s1')).toBe(false)
    expect(q.startDrain('s1')).toBe(true)
    expect(q.isDraining('s1')).toBe(true)
    expect(q.startDrain('s1')).toBe(false) // can't start twice
    q.stopDrain('s1')
    expect(q.isDraining('s1')).toBe(false)
  })

  it('status returns summary', () => {
    q.markActive('s1')
    q.enqueue('s1', { prompt: 'A' })
    expect(q.status('s1')).toEqual({ active: true, queued: 1, draining: false })
  })
})

// ── Collect prompt integration ──

describe('Collect prompt building (mirrors main.js drain logic)', () => {
  function buildCollectPrompt(items) {
    if (items.length === 1) return items[0].prompt
    return [
      '[Queued messages while agent was busy]',
      ...items.map((item, i) => `---\nQueued #${i + 1}\n${item.prompt}`),
    ].join('\n\n')
  }

  it('single message passes through unchanged', () => {
    const result = buildCollectPrompt([{ prompt: 'hello' }])
    expect(result).toBe('hello')
  })

  it('two messages produce collect format', () => {
    const result = buildCollectPrompt([
      { prompt: '你好' },
      { prompt: '帮我查天气' },
    ])
    expect(result).toContain('[Queued messages while agent was busy]')
    expect(result).toContain('Queued #1\n你好')
    expect(result).toContain('Queued #2\n帮我查天气')
    // Two separators
    expect(result.match(/---/g)).toHaveLength(2)
  })

  it('three messages are numbered correctly', () => {
    const result = buildCollectPrompt([
      { prompt: 'A' },
      { prompt: 'B' },
      { prompt: 'C' },
    ])
    expect(result).toContain('Queued #1\nA')
    expect(result).toContain('Queued #2\nB')
    expect(result).toContain('Queued #3\nC')
  })

  it('preserves multiline message content', () => {
    const result = buildCollectPrompt([
      { prompt: 'line 1\nline 2\nline 3' },
      { prompt: 'short' },
    ])
    expect(result).toContain('Queued #1\nline 1\nline 2\nline 3')
    expect(result).toContain('Queued #2\nshort')
  })
})

// ── Full drain simulation ──

describe('Drain simulation (queue → collect → run)', () => {
  it('simulates full A→B→C drain cycle', () => {
    const q = new ChatQueue()
    const runs = []

    // Simulate _runChat
    function runChat(item) {
      runs.push(item.prompt)
    }

    // Simulate drain logic from main.js
    function drainQueue(sessionId) {
      q.markIdle(sessionId)
      const items = q.shiftAll(sessionId)
      if (items.length > 0) {
        const merged = items.length === 1
          ? items[0]
          : {
              ...items[items.length - 1],
              userMessageSaved: true,
              prompt: [
                '[Queued messages while agent was busy]',
                ...items.map((item, i) => `---\nQueued #${i + 1}\n${item.prompt}`),
              ].join('\n\n'),
            }
        runChat(merged)
      }
    }

    // 1. User sends A — not queued (idle)
    expect(q.enqueue('s1', { prompt: 'A' })).toBe(false)
    q.markActive('s1') // A starts processing
    runChat({ prompt: 'A' })

    // 2. User sends B while A is processing — queued
    expect(q.enqueue('s1', { prompt: 'B', sessionId: 's1', requestId: 'r2' })).toBe(true)

    // 3. User sends C while A is still processing — queued
    expect(q.enqueue('s1', { prompt: 'C', sessionId: 's1', requestId: 'r3' })).toBe(true)

    expect(q.depth('s1')).toBe(2)

    // 4. A finishes — drain B+C as one collect
    drainQueue('s1')

    expect(runs).toHaveLength(2) // A (direct) + BC (collected)
    expect(runs[0]).toBe('A')
    expect(runs[1]).toContain('[Queued messages while agent was busy]')
    expect(runs[1]).toContain('Queued #1\nB')
    expect(runs[1]).toContain('Queued #2\nC')
    expect(q.depth('s1')).toBe(0)
  })

  it('single queued message is not wrapped in collect format', () => {
    const q = new ChatQueue()
    let drainedPrompt = null

    q.markActive('s1')
    q.enqueue('s1', { prompt: 'only B' })

    q.markIdle('s1')
    const items = q.shiftAll('s1')
    const merged = items.length === 1 ? items[0] : null
    drainedPrompt = merged?.prompt

    expect(drainedPrompt).toBe('only B') // no collect wrapper
  })

  it('merged item inherits metadata from last queued item', () => {
    const q = new ChatQueue()
    q.markActive('s1')
    q.enqueue('s1', { prompt: 'B', sessionId: 's1', requestId: 'r2', agentId: 'agent1' })
    q.enqueue('s1', { prompt: 'C', sessionId: 's1', requestId: 'r3', agentId: 'agent2' })

    const items = q.shiftAll('s1')
    const merged = {
      ...items[items.length - 1],
      userMessageSaved: true,
      prompt: '[collected]',
    }

    expect(merged.sessionId).toBe('s1')
    expect(merged.requestId).toBe('r3')    // last item's requestId
    expect(merged.agentId).toBe('agent2')  // last item's agentId
    expect(merged.userMessageSaved).toBe(true)
  })
})
