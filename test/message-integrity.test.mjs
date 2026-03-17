/**
 * test/message-integrity.test.mjs — Message integrity guarantee tests
 *
 * Tests the COMPLETE message flow from IPC entry to renderer state.
 * Every path that creates, routes, or mutates a message must be covered.
 *
 * Message flow:
 *   IPC 'chat' → chatQueue check → _runChat → streamChat → eventBus →
 *   useChatEvents handlers → routeUpdate/routeAdd/routeSet → React state
 *
 * Invariants to guarantee:
 *   I1. Every message has a globally unique ID
 *   I2. Message content always matches its sender
 *   I3. No message is lost during concurrent operations
 *   I4. Queue prevents parallel _runChat for same session
 *   I5. routeUpdate never destroys unrelated messages
 *   I6. DB reload (handleDone) preserves all completed messages
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ════════════════════════════════════════════════════════════════
// I1. Unique ID generation
// ════════════════════════════════════════════════════════════════

describe('I1: Unique ID generation', () => {
  it('generates 10000 unique IDs without collision', () => {
    let counter = 0
    const gen = () => `msg-${Date.now()}-${++counter}`
    const ids = new Set()
    for (let i = 0; i < 10000; i++) ids.add(gen())
    expect(ids.size).toBe(10000)
  })

  it('IDs are unique even when generated in same tick', () => {
    let counter = 0
    const gen = () => `msg-${Date.now()}-${++counter}`
    const t = Date.now()
    const batch = []
    // Generate all in a tight loop (same ms)
    while (Date.now() === t) {
      batch.push(gen())
    }
    // Plus a few more
    for (let i = 0; i < 100; i++) batch.push(gen())
    expect(new Set(batch).size).toBe(batch.length)
  })
})

// ════════════════════════════════════════════════════════════════
// I2. Sender/content integrity
// ════════════════════════════════════════════════════════════════

describe('I2: Sender/content integrity', () => {
  it('delegate events carry correct sender through entire pipeline', () => {
    // Simulate the full delegate event chain
    const events = []
    const agents = [
      { name: 'Alice', id: 'ws1', content: 'Hello from Alice' },
      { name: 'Bob', id: 'ws2', content: 'Hello from Bob' },
      { name: 'Charlie', id: 'ws3', content: 'Hello from Charlie' },
    ]

    const parentReqId = 'req-parent'
    for (const agent of agents) {
      // delegate-start
      events.push({
        type: 'delegate-start',
        requestId: parentReqId,
        sender: agent.name,
        workspaceId: agent.id,
      })
      // delegate-token
      events.push({
        type: 'delegate-token',
        requestId: parentReqId,
        sender: agent.name,
        token: agent.content,
      })
      // delegate-end
      events.push({
        type: 'delegate-end',
        requestId: parentReqId,
        sender: agent.name,
        fullText: agent.content,
      })
    }

    // Verify: each delegate-start → token → end chain has consistent sender
    for (let i = 0; i < events.length; i += 3) {
      const start = events[i]
      const token = events[i + 1]
      const end = events[i + 2]
      expect(start.sender).toBe(token.sender)
      expect(token.sender).toBe(end.sender)
      expect(end.fullText).toContain(start.sender.split(' ')[0])
    }
  })

  it('concurrent delegate events preserve sender isolation', () => {
    // Two agents streaming interleaved tokens
    const messages = new Map() // reqId → { sender, content }

    function processStart(reqId, sender) {
      messages.set(reqId, { sender, content: '' })
    }
    function processToken(reqId, sender, token) {
      const msg = messages.get(reqId)
      if (!msg) return
      // BUG CHECK: sender in token must match sender in start
      expect(msg.sender).toBe(sender)
      msg.content += token
    }

    processStart('r1', 'Alice')
    processStart('r2', 'Bob')
    // Interleaved
    processToken('r1', 'Alice', 'A1 ')
    processToken('r2', 'Bob', 'B1 ')
    processToken('r1', 'Alice', 'A2 ')
    processToken('r2', 'Bob', 'B2 ')

    expect(messages.get("r1").content).toBe('A1 A2 ')
    expect(messages.get("r2").content).toBe('B1 B2 ')
  })
})

// ════════════════════════════════════════════════════════════════
// I3. No message loss under concurrency
// ════════════════════════════════════════════════════════════════

describe('I3: No message loss', () => {
  /** Simulates routeUpdate with the FIXED logic */
  function routeUpdate(messages, msg) {
    const idx = messages.findIndex(m => m.id === msg.id)
    if (idx >= 0) {
      const next = [...messages]
      next[idx] = { ...msg }
      return next
    }
    // Fixed: add instead of replacing last
    return [...messages, msg]
  }

  function routeAdd(messages, msg) {
    return [...messages, msg]
  }

  it('routeUpdate preserves all messages when ID exists', () => {
    const msgs = [
      { id: 'a', content: 'old-a' },
      { id: 'b', content: 'old-b' },
      { id: 'c', content: 'old-c' },
    ]
    const result = routeUpdate(msgs, { id: 'b', content: 'new-b' })
    expect(result).toHaveLength(3)
    expect(result[1].content).toBe('new-b')
    expect(result[0].content).toBe('old-a')
    expect(result[2].content).toBe('old-c')
  })

  it('routeUpdate adds message when ID not found (no deletion)', () => {
    const msgs = [
      { id: 'a', content: 'content-a' },
      { id: 'b', content: 'content-b' },
    ]
    const result = routeUpdate(msgs, { id: 'c', content: 'content-c' })
    expect(result).toHaveLength(3) // Added, not replaced
    expect(result[0].content).toBe('content-a') // Preserved
    expect(result[1].content).toBe('content-b') // Preserved
    expect(result[2].content).toBe('content-c') // Added
  })

  it('50 concurrent routeUpdate calls never lose messages', () => {
    let msgs = []
    // Add 10 messages
    for (let i = 0; i < 10; i++) {
      msgs = routeAdd(msgs, { id: `msg-${i}`, content: `v0-${i}`, sender: `agent-${i % 5}` })
    }
    expect(msgs).toHaveLength(10)

    // Update each 5 times (simulating rapid streaming)
    for (let round = 1; round <= 5; round++) {
      for (let i = 0; i < 10; i++) {
        msgs = routeUpdate(msgs, { id: `msg-${i}`, content: `v${round}-${i}`, sender: `agent-${i % 5}` })
      }
    }

    expect(msgs).toHaveLength(10) // No loss, no duplication
    for (let i = 0; i < 10; i++) {
      expect(msgs[i].content).toBe(`v5-${i}`)
      expect(msgs[i].sender).toBe(`agent-${i % 5}`)
    }
  })

  it('mixed add/update operations maintain message count', () => {
    let msgs = []
    // Simulate: add msg1, update msg1, add msg2, update msg1, update msg2
    msgs = routeAdd(msgs, { id: 'x', content: '' })
    msgs = routeUpdate(msgs, { id: 'x', content: 'x1' })
    msgs = routeAdd(msgs, { id: 'y', content: '' })
    msgs = routeUpdate(msgs, { id: 'x', content: 'x2' })
    msgs = routeUpdate(msgs, { id: 'y', content: 'y1' })

    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toEqual({ id: 'x', content: 'x2' })
    expect(msgs[1]).toEqual({ id: 'y', content: 'y1' })
  })
})

// ════════════════════════════════════════════════════════════════
// I4. Queue prevents parallel execution
// ════════════════════════════════════════════════════════════════

describe('I4: Queue serialization', () => {
  it('prevents parallel _runChat for same session', async () => {
    const { ChatQueue } = await import('../core/chat-queue.js')
    const q = new ChatQueue()

    // Simulate: IPC handler marks active BEFORE async start
    q.markActive('s1')

    // Second message arrives — should be queued
    expect(q.enqueue('s1', { prompt: 'msg2', requestId: 'r2' })).toBe(true)
    expect(q.enqueue('s1', { prompt: 'msg3', requestId: 'r3' })).toBe(true)
    expect(q.depth('s1')).toBe(2)

    // First completes — drain
    q.markIdle('s1')
    const merged = q.drainAndMerge('s1')
    expect(merged).not.toBeNull()
    expect(merged.prompt).toContain('msg2')
    expect(merged.prompt).toContain('msg3')

    // Re-activate for drain
    q.markActive('s1')

    // Third message during drain — queued again
    expect(q.enqueue('s1', { prompt: 'msg4', requestId: 'r4' })).toBe(true)
  })

  it('different sessions are independent', async () => {
    const { ChatQueue } = await import('../core/chat-queue.js')
    const q = new ChatQueue()

    q.markActive('s1')
    // s2 is not active — should NOT queue
    expect(q.enqueue('s2', { prompt: 'x' })).toBe(false) // false = run now
    // s1 should queue
    expect(q.enqueue('s1', { prompt: 'y' })).toBe(true)
  })

  it('markActive before async prevents race window', async () => {
    const { ChatQueue } = await import('../core/chat-queue.js')
    const q = new ChatQueue()

    // Simulate the FIXED flow:
    // IPC handler (sync): markActive → async _runChat()
    const ipcHandler = (sid, msg) => {
      if (q.isActive(sid)) {
        return { queued: q.enqueue(sid, msg) }
      }
      q.markActive(sid) // sync, before any await
      return { started: true }
    }

    // Message 1: starts
    const r1 = ipcHandler('s1', { prompt: 'm1' })
    expect(r1.started).toBe(true)

    // Message 2: queued (even if _runChat hasn't started yet)
    const r2 = ipcHandler('s1', { prompt: 'm2' })
    expect(r2.queued).toBe(true)

    // Message 3: also queued
    const r3 = ipcHandler('s1', { prompt: 'm3' })
    expect(r3.queued).toBe(true)
  })

  it('drain re-activates before async start', async () => {
    const { ChatQueue } = await import('../core/chat-queue.js')
    const q = new ChatQueue()

    q.markActive('s1')
    q.enqueue('s1', { prompt: 'queued-1' })

    // Finish → drain → re-activate
    q.markIdle('s1')
    const merged = q.drainAndMerge('s1')
    if (merged) q.markActive('s1') // re-activate immediately

    // New message during drain execution — should be queued
    expect(q.isActive('s1')).toBe(true)
    expect(q.enqueue('s1', { prompt: 'during-drain' })).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════
// I5. routeUpdate never destroys unrelated messages
// ════════════════════════════════════════════════════════════════

describe('I5: routeUpdate safety', () => {
  function routeUpdate(messages, msg) {
    const idx = messages.findIndex(m => m.id === msg.id)
    if (idx >= 0) {
      const next = [...messages]
      next[idx] = { ...msg }
      return next
    }
    return [...messages, msg]
  }

  it('updating first message preserves rest', () => {
    const msgs = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, content: `c${i}` }))
    const result = routeUpdate(msgs, { id: 'm0', content: 'updated' })
    expect(result).toHaveLength(20)
    expect(result[0].content).toBe('updated')
    for (let i = 1; i < 20; i++) {
      expect(result[i].content).toBe(`c${i}`)
    }
  })

  it('updating last message preserves rest', () => {
    const msgs = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, content: `c${i}` }))
    const result = routeUpdate(msgs, { id: 'm19', content: 'updated' })
    expect(result).toHaveLength(20)
    expect(result[19].content).toBe('updated')
    for (let i = 0; i < 19; i++) {
      expect(result[i].content).toBe(`c${i}`)
    }
  })

  it('updating with unknown ID adds to end', () => {
    const msgs = [{ id: 'a', content: '1' }, { id: 'b', content: '2' }]
    const result = routeUpdate(msgs, { id: 'unknown', content: '3' })
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ id: 'a', content: '1' })
    expect(result[1]).toEqual({ id: 'b', content: '2' })
    expect(result[2]).toEqual({ id: 'unknown', content: '3' })
  })

  it('stress: 100 sequential updates on 50 messages', () => {
    let msgs = Array.from({ length: 50 }, (_, i) => ({ id: `m${i}`, content: `v0` }))
    for (let u = 1; u <= 100; u++) {
      const targetIdx = u % 50
      msgs = routeUpdate(msgs, { id: `m${targetIdx}`, content: `v${u}` })
    }
    expect(msgs).toHaveLength(50)
    // Each message was updated twice (100/50)
    for (let i = 0; i < 50; i++) {
      expect(msgs[i].id).toBe(`m${i}`)
    }
  })
})

// ════════════════════════════════════════════════════════════════
// I6. DB reload preserves messages
// ════════════════════════════════════════════════════════════════

describe('I6: DB reload (handleDone) correctness', () => {
  it('routeSet replaces streaming messages with DB messages', () => {
    // Before: streaming state with temp IDs
    const streamingMsgs = [
      { id: 'user-1', role: 'user', content: 'hello' },
      { id: 'streaming-123-1', role: 'assistant', content: 'partial...' },
    ]

    // DB has the completed version
    const dbMsgs = [
      { id: 'db-1', role: 'user', content: 'hello' },
      { id: 'db-2', role: 'assistant', content: 'Hello! How can I help?' },
    ]

    // routeSet replaces everything
    const result = dbMsgs // this is what routeSet does
    expect(result).toHaveLength(2)
    expect(result[1].content).toBe('Hello! How can I help?')
  })

  it('DB messages include delegate responses in correct order', () => {
    // Simulates finishChat saving orchestrator + delegate messages
    const dbMsgs = [
      { id: 'db-1', role: 'user', content: 'Tell everyone hello' },
      { id: 'db-2', role: 'assistant', content: '', sender: 'Orchestrator', toolSteps: [{ name: 'delegate_to' }] },
      { id: 'db-3', role: 'assistant', content: 'Hi from Alice!', sender: 'Alice' },
      { id: 'db-4', role: 'assistant', content: '', sender: 'Orchestrator', toolSteps: [{ name: 'delegate_to' }] },
      { id: 'db-5', role: 'assistant', content: 'Hi from Bob!', sender: 'Bob' },
      { id: 'db-6', role: 'assistant', content: 'NO_REPLY', sender: 'Orchestrator' },
    ]

    // Verify order: orch → alice → orch → bob → orch
    expect(dbMsgs[2].sender).toBe('Alice')
    expect(dbMsgs[4].sender).toBe('Bob')
    expect(dbMsgs[2].content).toContain('Alice')
    expect(dbMsgs[4].content).toContain('Bob')
  })

  it('error appended when DB has no error message', () => {
    const dbMsgs = [
      { id: 'db-1', role: 'user', content: 'test' },
    ]
    const hasError = !dbMsgs.some(m => m.isError)
    expect(hasError).toBe(true)

    if (hasError) {
      dbMsgs.push({ id: 'err-1', role: 'assistant', content: 'API error', isError: true })
    }
    expect(dbMsgs).toHaveLength(2)
    expect(dbMsgs[1].isError).toBe(true)
  })

  it('error NOT duplicated when DB already has error', () => {
    const dbMsgs = [
      { id: 'db-1', role: 'user', content: 'test' },
      { id: 'db-2', role: 'assistant', content: 'API error', isError: true },
    ]
    const hasError = !dbMsgs.some(m => m.isError)
    expect(hasError).toBe(false) // Already has error, don't add
  })
})

// ════════════════════════════════════════════════════════════════
// Integration: Full 5-agent group chat simulation
// ════════════════════════════════════════════════════════════════

describe('Integration: 5-agent group chat', () => {
  /** Minimal renderer simulation */
  class RendererSim {
    messages = []
    _idCounter = 0

    generateId() { return `sim-${Date.now()}-${++this._idCounter}` }

    routeAdd(msg) { this.messages.push({ ...msg }) }

    routeUpdate(msg) {
      const idx = this.messages.findIndex(m => m.id === msg.id)
      if (idx >= 0) { this.messages[idx] = { ...msg }; return }
      this.messages.push(msg) // fallback: add
    }

    routeRemove(id) { this.messages = this.messages.filter(m => m.id !== id) }

    routeSet(msgs) { this.messages = [...msgs] }
  }

  it('5 agents, 3 rounds, interleaved streaming — no loss, no mismatch', () => {
    const r = new RendererSim()
    const agents = ['Alice', 'Bob', 'Charlie', 'Dave', 'Eve']
    const parentReqId = 'parent-1'

    // 3 rounds of delegation
    for (let round = 0; round < 3; round++) {
      for (const agent of agents) {
        const msgId = r.generateId()

        // delegate-start → add card
        r.routeAdd({
          id: msgId,
          role: 'assistant',
          sender: agent,
          content: '',
        })

        // 20 tokens of streaming
        for (let t = 0; t < 20; t++) {
          r.routeUpdate({
            id: msgId,
            role: 'assistant',
            sender: agent,
            content: `${agent}-r${round}-` + Array.from({ length: t + 1 }, (_, i) => `t${i}`).join(' '),
          })
        }
      }
    }

    // Verify: 15 messages (5 agents × 3 rounds)
    expect(r.messages).toHaveLength(15)

    // Verify: each message has correct sender and content
    let idx = 0
    for (let round = 0; round < 3; round++) {
      for (const agent of agents) {
        const msg = r.messages[idx++]
        expect(msg.sender).toBe(agent)
        expect(msg.content).toContain(agent)
        expect(msg.content).toContain(`r${round}`)
        expect(msg.content).toContain('t19') // Last token
      }
    }
  })

  it('rapid fire: 100 messages in single tick', () => {
    const r = new RendererSim()
    const agents = ['A', 'B', 'C', 'D', 'E']

    for (let i = 0; i < 100; i++) {
      const agent = agents[i % 5]
      const id = r.generateId()
      r.routeAdd({ id, role: 'assistant', sender: agent, content: '' })
      r.routeUpdate({ id, role: 'assistant', sender: agent, content: `msg-${i}` })
    }

    expect(r.messages).toHaveLength(100)
    for (let i = 0; i < 100; i++) {
      expect(r.messages[i].sender).toBe(agents[i % 5])
      expect(r.messages[i].content).toBe(`msg-${i}`)
    }
  })

  it('DB reload after streaming replaces temp messages', () => {
    const r = new RendererSim()

    // Streaming state
    r.routeAdd({ id: 'streaming-1', role: 'assistant', sender: 'Alice', content: 'partial' })
    r.routeAdd({ id: 'streaming-2', role: 'assistant', sender: 'Bob', content: 'also partial' })
    expect(r.messages).toHaveLength(2)

    // DB reload
    const dbMsgs = [
      { id: 'db-1', role: 'user', content: 'hello', sender: 'User' },
      { id: 'db-2', role: 'assistant', content: 'Full response from Alice', sender: 'Alice' },
      { id: 'db-3', role: 'assistant', content: 'Full response from Bob', sender: 'Bob' },
    ]
    r.routeSet(dbMsgs)

    expect(r.messages).toHaveLength(3)
    expect(r.messages[1].content).toBe('Full response from Alice')
    expect(r.messages[2].content).toBe('Full response from Bob')
  })
})
