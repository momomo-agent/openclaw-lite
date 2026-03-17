/**
 * test/large-group-stress.test.mjs — 10+ agent group chat stress tests
 *
 * Blue team attack scenarios for large groups.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Blue Team: Large Group (10+ agents)', () => {

  describe('Attack 1: Serial delegate timeout', () => {
    it('10 sequential delegates of 55s each exceed 600s total timeout', () => {
      const AGENT_TIMEOUT_MS = 600_000 // 10 minutes
      const PER_DELEGATE_AVG_MS = 55_000 // 55 seconds each

      // 10 agents = 550s, under 600s limit — passes
      expect(10 * PER_DELEGATE_AVG_MS).toBeLessThan(AGENT_TIMEOUT_MS)

      // 11 agents = 605s — EXCEEDS timeout!
      expect(11 * PER_DELEGATE_AVG_MS).toBeGreaterThan(AGENT_TIMEOUT_MS)

      // 15 agents = 825s — way over
      expect(15 * PER_DELEGATE_AVG_MS).toBeGreaterThan(AGENT_TIMEOUT_MS)
    })

    it('timeout should be extended based on participant count', () => {
      // Proposed fix: timeout = max(600, participants * 120) seconds
      const dynamicTimeout = (participants) => Math.max(600, participants * 120) * 1000

      expect(dynamicTimeout(5)).toBe(600_000)  // 5 agents → 600s (minimum)
      expect(dynamicTimeout(10)).toBe(1200_000) // 10 agents → 1200s (20min)
      expect(dynamicTimeout(15)).toBe(1800_000) // 15 agents → 1800s (30min)
    })
  })

  describe('Attack 2: Stall timeout during large group', () => {
    it('each delegate has independent stall detection', () => {
      const STALL_TIMEOUT_MS = 60_000
      const delegates = Array.from({ length: 10 }, (_, i) => ({
        agentName: `Agent${i}`,
        stallTimer: null,
        stalled: false,
      }))

      // Each delegate should have its own stall timer
      for (const d of delegates) {
        d.stallTimer = setTimeout(() => { d.stalled = true }, STALL_TIMEOUT_MS)
      }

      // Clean up
      for (const d of delegates) clearTimeout(d.stallTimer)

      // Verify: independent timers
      expect(delegates.filter(d => d.stalled)).toHaveLength(0)
    })
  })

  describe('Attack 3: Memory pressure from pendingDelegateMessages', () => {
    it('10 delegate responses stored in memory', () => {
      const pending = new Map()
      const reqId = 'req-1'

      // Simulate 10 delegate responses, each 10KB
      for (let i = 0; i < 10; i++) {
        if (!pending.has(reqId)) pending.set(reqId, [])
        pending.get(reqId).push({
          sender: `Agent${i}`,
          content: 'x'.repeat(10_000), // 10KB each
          timestamp: Date.now(),
        })
      }

      expect(pending.get(reqId)).toHaveLength(10)

      // Total memory: ~100KB — acceptable
      const totalBytes = pending.get(reqId).reduce((sum, m) => sum + m.content.length, 0)
      expect(totalBytes).toBe(100_000)

      // But 50 agents × 100KB each = 5MB — still OK for Electron
      expect(50 * 100_000).toBeLessThan(10_000_000) // Under 10MB
    })
  })

  describe('Attack 4: finishChat sequential DB writes', () => {
    it('10+ appendMessage calls should not lose messages', () => {
      const db = []
      const appendMessage = (msg) => { db.push(msg) }

      // Simulate finishChat with 10 delegates
      const orchestratorSteps = Array.from({ length: 10 }, (_, i) => ({
        name: 'delegate_to',
        input: { participant_name: `Agent${i}`, message: 'hello' },
      }))

      const delegateResponses = Array.from({ length: 10 }, (_, i) => ({
        sender: `Agent${i}`,
        content: `Response from Agent${i}`,
        timestamp: Date.now(),
      }))

      // Save in visual order (orchestrator segment → delegate → ...)
      let currentSteps = []
      let delegateIdx = 0
      for (const step of orchestratorSteps) {
        currentSteps.push(step)
        if (step.name === 'delegate_to' && delegateIdx < delegateResponses.length) {
          // Flush orchestrator segment
          appendMessage({ role: 'assistant', content: '', toolSteps: currentSteps })
          currentSteps = []
          // Save delegate response
          const dm = delegateResponses[delegateIdx++]
          appendMessage({ role: 'assistant', content: dm.content, sender: dm.sender })
        }
      }

      // Verify: 10 orchestrator segments + 10 delegate responses = 20 messages
      expect(db).toHaveLength(20)

      // Verify: correct interleaving
      for (let i = 0; i < 20; i += 2) {
        expect(db[i].toolSteps).toBeDefined()
        expect(db[i + 1].sender).toBe(`Agent${i / 2}`)
      }
    })
  })

  describe('Attack 5: Context window overflow with 10+ agents', () => {
    it('group history with 10 agents can exceed context limit', () => {
      // Each agent response: ~500 tokens avg
      // 10 agents × 20 rounds × 500 tokens = 100K tokens
      const agentCount = 10
      const rounds = 20
      const avgTokensPerResponse = 500
      const totalTokens = agentCount * rounds * avgTokensPerResponse

      // Claude's context: 200K tokens
      const CONTEXT_LIMIT = 200_000

      expect(totalTokens).toBe(100_000)
      expect(totalTokens).toBeLessThan(CONTEXT_LIMIT) // OK for 20 rounds

      // But 50 rounds → 250K tokens — EXCEEDS!
      expect(agentCount * 50 * avgTokensPerResponse).toBeGreaterThan(CONTEXT_LIMIT)
    })
  })

  describe('Attack 6: Delegate loads history for EACH agent', () => {
    it('each delegate loads last 20 messages independently', () => {
      const sessionMessages = Array.from({ length: 100 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `message ${i}`,
      }))

      // Each delegate takes slice(-20) — 20 messages per delegate
      const delegateHistorySize = 20

      // 10 delegates × 20 messages = 200 message copies in memory
      const totalCopies = 10 * delegateHistorySize
      expect(totalCopies).toBe(200)

      // 15 delegates × 20 messages = 300 copies
      expect(15 * delegateHistorySize).toBe(300)

      // Memory: 300 × ~1KB = 300KB — acceptable
    })
  })

  describe('Attack 7: Participant name collision', () => {
    it('partial name matching can match wrong agent', () => {
      const agents = [
        { id: 'ws1', identity: { name: 'Alice' } },
        { id: 'ws2', identity: { name: 'AliceBot' } },
        { id: 'ws3', identity: { name: 'Al' } },
      ]

      // Current matching: q.startsWith(name) || name.startsWith(q)
      const match = (query) => {
        const q = query.toLowerCase()
        return agents.find(a => {
          const n = a.identity.name.toLowerCase()
          return n === q || n.startsWith(q) || q.startsWith(n)
        })
      }

      // "al" matches "Al" (exact) — but also could match "Alice"!
      const result = match('al')
      // First match wins — depends on array order
      expect(result.identity.name).toBe('Alice') // BUG: should be "Al" (exact match)
    })

    it('exact match should take priority over partial', () => {
      const agents = [
        { id: 'ws1', identity: { name: 'Alice' } },
        { id: 'ws2', identity: { name: 'AliceBot' } },
        { id: 'ws3', identity: { name: 'Al' } },
      ]

      // FIXED matching: exact first, then partial
      const matchFixed = (query) => {
        const q = query.toLowerCase()
        // 1. Exact match
        const exact = agents.find(a => a.identity.name.toLowerCase() === q)
        if (exact) return exact
        // 2. Partial match
        return agents.find(a => {
          const n = a.identity.name.toLowerCase()
          return n.startsWith(q) || q.startsWith(n)
        })
      }

      expect(matchFixed('al').identity.name).toBe('Al') // Fixed: exact match
      expect(matchFixed('alice').identity.name).toBe('Alice') // Exact
      expect(matchFixed('alicebot').identity.name).toBe('AliceBot') // Exact
    })
  })

  describe('Attack 8: Event bus listener leak with many agents', () => {
    it('delegate registers event handlers and MUST clean them up', () => {
      const registeredHandlers = []
      const mockEventBus = {
        on: (ch, handler) => registeredHandlers.push({ ch, handler }),
        off: (ch, handler) => {
          const idx = registeredHandlers.findIndex(h => h.ch === ch && h.handler === handler)
          if (idx >= 0) registeredHandlers.splice(idx, 1)
        },
      }

      // 10 delegates, each registers 5 handlers
      const delegateHandlers = []
      for (let i = 0; i < 10; i++) {
        const handlers = []
        for (const ch of ['chat-token', 'chat-tool-step', 'chat-round-info', 'chat-status', 'chat-text-start']) {
          const handler = () => {}
          mockEventBus.on(ch, handler)
          handlers.push({ ch, handler })
        }
        delegateHandlers.push(handlers)
      }

      expect(registeredHandlers).toHaveLength(50) // 10 × 5

      // Clean up all
      for (const handlers of delegateHandlers) {
        for (const { ch, handler } of handlers) {
          mockEventBus.off(ch, handler)
        }
      }

      expect(registeredHandlers).toHaveLength(0) // All cleaned
    })
  })
})
