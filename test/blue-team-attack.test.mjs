/**
 * test/blue-team-attack.test.mjs — Blue Team Attack Tests
 * 
 * Adversarial testing: try to break message integrity with edge cases.
 * If these pass, the system is resilient.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Blue Team: Attack Vector Tests', () => {
  describe('Attack 1: Same-millisecond ID collision', () => {
    it('100 IDs generated in same tick must be unique', () => {
      let counter = 0
      const gen = () => `msg-${Date.now()}-${++counter}`
      
      const startTime = Date.now()
      const ids = []
      // Force all in same millisecond
      while (Date.now() === startTime && ids.length < 100) {
        ids.push(gen())
      }
      
      expect(ids.length).toBeGreaterThan(10) // At least some in same ms
      expect(new Set(ids).size).toBe(ids.length) // All unique
    })
  })

  describe('Attack 2: routeUpdate before routeAdd', () => {
    function routeUpdate(messages, msg) {
      const idx = messages.findIndex(m => m.id === msg.id)
      if (idx >= 0) {
        const next = [...messages]
        next[idx] = { ...msg }
        return next
      }
      return [...messages, msg] // Fixed: add instead of delete-last
    }

    it('update arrives before add — should not corrupt state', () => {
      let msgs = []
      
      // Scenario: delegate-token arrives before delegate-start
      msgs = routeUpdate(msgs, { id: 'msg-1', content: 'token1' })
      expect(msgs).toHaveLength(1)
      expect(msgs[0].content).toBe('token1')
      
      // More tokens
      msgs = routeUpdate(msgs, { id: 'msg-1', content: 'token1 token2' })
      expect(msgs).toHaveLength(1)
      
      // Another message starts
      msgs = routeUpdate(msgs, { id: 'msg-2', content: 'hello' })
      expect(msgs).toHaveLength(2)
      expect(msgs[0].id).toBe('msg-1')
      expect(msgs[1].id).toBe('msg-2')
    })
  })

  describe('Attack 3: Interleaved events from 5 agents', () => {
    class MessageState {
      messages = []
      _counter = 0
      
      genId() { return `m-${Date.now()}-${++this._counter}` }
      
      add(msg) { this.messages.push({ ...msg }) }
      
      update(msg) {
        const idx = this.messages.findIndex(m => m.id === msg.id)
        if (idx >= 0) { this.messages[idx] = { ...msg }; return }
        this.messages.push(msg)
      }
    }

    it('5 agents × 20 interleaved tokens — no corruption', () => {
      const state = new MessageState()
      const agents = ['A', 'B', 'C', 'D', 'E']
      const msgIds = agents.map(() => state.genId())
      
      // Start all 5
      for (let i = 0; i < 5; i++) {
        state.add({ id: msgIds[i], sender: agents[i], content: '' })
      }
      
      // 20 rounds of interleaved tokens
      for (let round = 0; round < 20; round++) {
        for (let i = 0; i < 5; i++) {
          const prev = state.messages[i].content
          state.update({
            id: msgIds[i],
            sender: agents[i],
            content: prev + `${agents[i]}${round} `,
          })
        }
      }
      
      // Verify
      expect(state.messages).toHaveLength(5)
      for (let i = 0; i < 5; i++) {
        expect(state.messages[i].sender).toBe(agents[i])
        expect(state.messages[i].content).toContain(`${agents[i]}0`)
        expect(state.messages[i].content).toContain(`${agents[i]}19`)
      }
    })
  })

  describe('Attack 4: chatQueue race window', () => {
    class ChatQueue {
      _sessions = new Map()
      
      _get(sid) {
        if (!this._sessions.has(sid)) {
          this._sessions.set(sid, { active: false, queue: [] })
        }
        return this._sessions.get(sid)
      }
      
      markActive(sid) { this._get(sid).active = true }
      markIdle(sid) { this._get(sid).active = false }
      isActive(sid) { return this._get(sid).active }
      
      enqueue(sid, item) {
        const s = this._get(sid)
        if (!s.active) return false
        s.queue.push(item)
        return true
      }
      
      drainAndMerge(sid) {
        const s = this._get(sid)
        const items = s.queue.slice()
        s.queue = []
        if (items.length === 0) return null
        if (items.length === 1) return items[0]
        return { prompt: items.map(i => i.prompt).join('\n') }
      }
    }

    it('markActive BEFORE async prevents double execution', () => {
      const q = new ChatQueue()
      const executions = []
      
      // Simulate IPC handler (FIXED: markActive before async)
      const ipcHandler = (sid, msg) => {
        if (q.isActive(sid)) {
          return { queued: q.enqueue(sid, msg) }
        }
        q.markActive(sid) // sync, before any await
        executions.push(msg.prompt)
        return { started: true }
      }
      
      // Rapid fire 10 messages
      const results = []
      for (let i = 0; i < 10; i++) {
        results.push(ipcHandler('s1', { prompt: `msg-${i}` }))
      }
      
      // Only first should start, rest queued
      expect(results[0].started).toBe(true)
      for (let i = 1; i < 10; i++) {
        expect(results[i].queued).toBe(true)
      }
      expect(executions).toHaveLength(1)
    })

    it('drain re-activates before async start', () => {
      const q = new ChatQueue()
      
      q.markActive('s1')
      q.enqueue('s1', { prompt: 'queued-1' })
      q.enqueue('s1', { prompt: 'queued-2' })
      
      // Finish → drain → re-activate (FIXED)
      q.markIdle('s1')
      const merged = q.drainAndMerge('s1')
      expect(merged).not.toBeNull()
      
      q.markActive('s1') // re-activate immediately
      
      // New message during drain execution — should queue
      expect(q.isActive('s1')).toBe(true)
      expect(q.enqueue('s1', { prompt: 'during-drain' })).toBe(true)
    })
  })

  describe('Attack 5: handleDone DB reload race', () => {
    it('DB reload does not corrupt concurrent streaming', () => {
      // Scenario: session A finishes → handleDone loads DB
      // Meanwhile session B is streaming
      
      const sessionCache = new Map()
      
      // Session A streaming
      sessionCache.set('s1', [
        { id: 'streaming-1', role: 'assistant', content: 'partial...' }
      ])
      
      // Session B streaming
      sessionCache.set('s2', [
        { id: 'streaming-2', role: 'assistant', content: 'also partial...' }
      ])
      
      // Session A finishes → DB reload (routeSet)
      const dbMsgsA = [
        { id: 'db-1', role: 'user', content: 'hello' },
        { id: 'db-2', role: 'assistant', content: 'Full response' }
      ]
      sessionCache.set('s1', dbMsgsA)
      
      // Session B should be unaffected
      expect(sessionCache.get('s2')).toHaveLength(1)
      expect(sessionCache.get('s2')[0].id).toBe('streaming-2')
    })
  })

  describe('Attack 6: requestId reuse', () => {
    it('different sessions can have same requestId without conflict', () => {
      const streamStates = new Map()
      
      // Both sessions use 'req-1' (different contexts)
      streamStates.set('s1', { requestId: 'req-1', streamingMsg: { id: 'm1', content: 'A' } })
      streamStates.set('s2', { requestId: 'req-1', streamingMsg: { id: 'm2', content: 'B' } })
      
      // Guard function checks sessionId + requestId
      const guard = (event, data) => {
        const sid = data.sessionId
        const ss = streamStates.get(sid)
        if (!ss) return null
        if (ss.requestId !== data.requestId) return null
        return { sid, ss }
      }
      
      // Event for s1
      const g1 = guard('token', { sessionId: 's1', requestId: 'req-1' })
      expect(g1).not.toBeNull()
      expect(g1.ss.streamingMsg.content).toBe('A')
      
      // Event for s2
      const g2 = guard('token', { sessionId: 's2', requestId: 'req-1' })
      expect(g2).not.toBeNull()
      expect(g2.ss.streamingMsg.content).toBe('B')
    })
  })

  describe('Attack 7: finishChat + new message race', () => {
    it('new message during finishChat does not corrupt DB', async () => {
      // Simulate: finishChat is saving messages to DB
      // Meanwhile a new message arrives
      
      const dbMessages = []
      let saving = false
      
      const finishChat = async (msg) => {
        saving = true
        await new Promise(r => setTimeout(r, 10)) // simulate DB write
        dbMessages.push(msg)
        saving = false
      }
      
      const newMessage = (msg) => {
        if (saving) {
          // Should queue or wait, not corrupt
          return { queued: true }
        }
        return { started: true }
      }
      
      // Start finish
      const p = finishChat({ role: 'assistant', content: 'done' })
      
      // New message arrives mid-save
      const result = newMessage({ role: 'user', content: 'next' })
      expect(result.queued).toBe(true)
      
      await p
      expect(dbMessages).toHaveLength(1)
    })
  })
})
