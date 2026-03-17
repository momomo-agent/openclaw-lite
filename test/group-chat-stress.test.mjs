/**
 * test/group-chat-stress.test.mjs — Group chat stress tests
 * 
 * Reproduces real-world issues:
 * - 5 agents in group chat
 * - Fast consecutive messages
 * - Message/sender mismatch
 * - Empty messages
 * - Messages not showing
 * - Cross-talk (串台)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventEmitter } from 'events'

// Mock dependencies
const mockEventBus = new EventEmitter()
mockEventBus.dispatch = vi.fn((channel, data) => mockEventBus.emit(channel, data))
mockEventBus._recent = new Map()
mockEventBus._latestStatus = new Map()

const mockSessionStore = {
  getSessionParticipants: vi.fn(() => ['ws1', 'ws2', 'ws3', 'ws4', 'ws5']),
  loadSession: vi.fn(() => ({ messages: [] })),
  saveMessage: vi.fn(),
}

const mockWorkspaces = {
  ws1: { id: 'ws1', type: 'assistant', identity: { name: 'Alice', avatar: '👩' }, path: '/tmp/ws1' },
  ws2: { id: 'ws2', type: 'assistant', identity: { name: 'Bob', avatar: '👨' }, path: '/tmp/ws2' },
  ws3: { id: 'ws3', type: 'assistant', identity: { name: 'Charlie', avatar: '🧑' }, path: '/tmp/ws3' },
  ws4: { id: 'ws4', type: 'coding-agent', engine: 'claude', identity: { name: 'Claude', avatar: '🤖' }, path: '/tmp/ws4' },
  ws5: { id: 'ws5', type: 'assistant', identity: { name: 'Eve', avatar: '👤' }, path: '/tmp/ws5' },
}

const mockCtx = {
  eventBus: mockEventBus,
  sessionStore: mockSessionStore,
  getWorkspace: (id) => mockWorkspaces[id],
  buildSystemPrompt: vi.fn(async () => 'System prompt'),
  resolveSessionDb: vi.fn(() => 'mock.db'),
  routeToCodingAgent: vi.fn(async (ws, msg) => `${ws.identity.name} response to: ${msg}`),
  getToolsWithMcp: vi.fn(() => [
    { name: 'search', description: 'Search' },
    { name: 'delegate_to', description: 'Delegate' },
  ]),
  streamAnthropic: vi.fn(async (msgs, prompt, config, rid, tools, sid) => ({
    answer: `Response from ${prompt.match(/\*\*(\w+)\*\*/)?.[1] || 'Agent'}`,
    toolSteps: [],
  })),
  streamOpenAI: vi.fn(async (msgs, prompt, config, rid, tools, sid) => ({
    answer: `Response from ${prompt.match(/\*\*(\w+)\*\*/)?.[1] || 'Agent'}`,
    toolSteps: [],
  })),
  configPath: vi.fn(() => '/tmp/fake-config.json'),
  _activeRequestId: null,
  _activeAbortController: null,
  _pendingDelegateMessages: new Map(),
  streamToLLM: vi.fn(async function* (params) {
    yield { type: 'text', text: `Response from ${params.systemPrompt.slice(0, 20)}` }
  }),
}

describe('Group Chat Stress Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEventBus.removeAllListeners()
    mockEventBus._recent.clear()
    mockEventBus._latestStatus.clear()
    mockCtx._pendingDelegateMessages.clear()
  })

  describe('Scenario 1: Fast consecutive messages (5 agents)', () => {
    it('should handle 10 rapid messages without cross-talk', async () => {
      const { handleDelegateTo } = await import('../core/delegate.js')
      const messages = []
      
      // Simulate 10 rapid delegate calls
      const promises = []
      for (let i = 0; i < 10; i++) {
        const targetName = ['Alice', 'Bob', 'Charlie', 'Claude', 'Eve'][i % 5]
        mockCtx._activeRequestId = `req-${i}`
        
        const p = handleDelegateTo(
          { participant_name: targetName, message: `Message ${i}` },
          {},
          'session-1',
          mockCtx
        ).then(response => {
          messages.push({ reqId: `req-${i}`, target: targetName, response })
        })
        promises.push(p)
      }

      await Promise.all(promises)

      // Verify: each message should have correct target
      expect(messages).toHaveLength(10)
      for (let i = 0; i < 10; i++) {
        const msg = messages.find(m => m.reqId === `req-${i}`)
        expect(msg).toBeDefined()
        expect(msg.response).toContain(['Alice', 'Bob', 'Charlie', 'Claude', 'Eve'][i % 5])
      }
    })

    it('should not mix responses between concurrent requests', async () => {
      const { handleDelegateTo } = await import('../core/delegate.js')
      const results = new Map()

      // 5 concurrent requests to different agents
      await Promise.all([
        handleDelegateTo({ participant_name: 'Alice', message: 'A1' }, {}, 'session-1', { ...mockCtx, _activeRequestId: 'r1' })
          .then(r => results.set('r1', r)),
        handleDelegateTo({ participant_name: 'Bob', message: 'B1' }, {}, 'session-1', { ...mockCtx, _activeRequestId: 'r2' })
          .then(r => results.set('r2', r)),
        handleDelegateTo({ participant_name: 'Charlie', message: 'C1' }, {}, 'session-1', { ...mockCtx, _activeRequestId: 'r3' })
          .then(r => results.set('r3', r)),
        handleDelegateTo({ participant_name: 'Claude', message: 'D1' }, {}, 'session-1', { ...mockCtx, _activeRequestId: 'r4' })
          .then(r => results.set('r4', r)),
        handleDelegateTo({ participant_name: 'Eve', message: 'E1' }, {}, 'session-1', { ...mockCtx, _activeRequestId: 'r5' })
          .then(r => results.set('r5', r)),
      ])

      // Each response should match its target
      expect(results.get('r1')).toContain('Alice')
      expect(results.get('r2')).toContain('Bob')
      expect(results.get('r3')).toContain('Charlie')
      expect(results.get('r4')).toContain('Claude')
      expect(results.get('r5')).toContain('Eve')
    })
  })

  describe('Scenario 2: EventBus dispatch race conditions', () => {
    it('should not lose events when dispatching rapidly', () => {
      const received = []
      mockEventBus.on('chat-token', (data) => received.push(data))

      // Rapid fire 100 events
      for (let i = 0; i < 100; i++) {
        mockEventBus.dispatch('chat-token', { requestId: `req-${i}`, text: `token-${i}` })
      }

      expect(received).toHaveLength(100)
      expect(received[0].text).toBe('token-0')
      expect(received[99].text).toBe('token-99')
    })

    it('should maintain requestId isolation in concurrent streams', () => {
      const streams = { r1: [], r2: [], r3: [] }
      
      mockEventBus.on('chat-token', (data) => {
        if (data.requestId === 'r1') streams.r1.push(data.text)
        if (data.requestId === 'r2') streams.r2.push(data.text)
        if (data.requestId === 'r3') streams.r3.push(data.text)
      })

      // Interleaved dispatch (simulating concurrent streams)
      mockEventBus.dispatch('chat-token', { requestId: 'r1', text: 'a1' })
      mockEventBus.dispatch('chat-token', { requestId: 'r2', text: 'b1' })
      mockEventBus.dispatch('chat-token', { requestId: 'r1', text: 'a2' })
      mockEventBus.dispatch('chat-token', { requestId: 'r3', text: 'c1' })
      mockEventBus.dispatch('chat-token', { requestId: 'r2', text: 'b2' })
      mockEventBus.dispatch('chat-token', { requestId: 'r1', text: 'a3' })

      expect(streams.r1).toEqual(['a1', 'a2', 'a3'])
      expect(streams.r2).toEqual(['b1', 'b2'])
      expect(streams.r3).toEqual(['c1'])
    })
  })

  describe('Scenario 3: Chat queue under load', () => {
    it('should queue messages when session is active', async () => {
      const { ChatQueue } = await import('../core/chat-queue.js')
      const queue = new ChatQueue()

      queue.markActive('s1')
      
      // Enqueue 5 messages while active
      expect(queue.enqueue('s1', { prompt: 'm1' })).toBe(true)
      expect(queue.enqueue('s1', { prompt: 'm2' })).toBe(true)
      expect(queue.enqueue('s1', { prompt: 'm3' })).toBe(true)
      expect(queue.enqueue('s1', { prompt: 'm4' })).toBe(true)
      expect(queue.enqueue('s1', { prompt: 'm5' })).toBe(true)

      expect(queue.depth('s1')).toBe(5)

      // Drain and merge
      const merged = queue.drainAndMerge('s1')
      expect(merged.prompt).toContain('Queued #1')
      expect(merged.prompt).toContain('Queued #5')
      expect(queue.depth('s1')).toBe(0)
    })

    it('should handle rapid enqueue/drain cycles', async () => {
      const { ChatQueue } = await import('../core/chat-queue.js')
      const queue = new ChatQueue()

      for (let cycle = 0; cycle < 10; cycle++) {
        queue.markActive('s1')
        
        // Enqueue burst
        for (let i = 0; i < 5; i++) {
          queue.enqueue('s1', { prompt: `c${cycle}-m${i}` })
        }

        // Drain
        queue.markIdle('s1')
        const merged = queue.drainAndMerge('s1')
        
        if (merged) {
          expect(merged.prompt).toContain(`c${cycle}`)
        }
      }

      expect(queue.depth('s1')).toBe(0)
    })
  })

  describe('Scenario 4: Empty message detection', () => {
    it('should reject empty delegate messages', async () => {
      const { handleDelegateTo } = await import('../core/delegate.js')

      const result = await handleDelegateTo(
        { participant_name: 'Alice', message: '' },
        {},
        'session-1',
        mockCtx
      )

      expect(result).toContain('Error')
    })

    it('should reject missing participant_name', async () => {
      const { handleDelegateTo } = await import('../core/delegate.js')

      const result = await handleDelegateTo(
        { message: 'hello' },
        {},
        'session-1',
        mockCtx
      )

      expect(result).toContain('Error')
    })
  })

  describe('Scenario 5: Sender/message mismatch', () => {
    it('should preserve sender identity in pendingDelegateMessages', async () => {
      const { handleDelegateTo } = await import('../core/delegate.js')
      const ctx = { ...mockCtx, _activeRequestId: 'req-test', _pendingDelegateMessages: new Map() }

      await handleDelegateTo(
        { participant_name: 'Alice', message: 'test' },
        {},
        'session-1',
        ctx
      )

      const pending = ctx._pendingDelegateMessages.get('req-test')
      expect(pending).toBeDefined()
      expect(pending[0].sender).toBe('Alice')
      expect(pending[0].senderWorkspaceId).toBe('ws1')
    })

    it('should not mix senders in concurrent delegates', async () => {
      const { handleDelegateTo } = await import('../core/delegate.js')
      const ctx1 = { ...mockCtx, _activeRequestId: 'r1', _pendingDelegateMessages: new Map() }
      const ctx2 = { ...mockCtx, _activeRequestId: 'r2', _pendingDelegateMessages: new Map() }

      await Promise.all([
        handleDelegateTo({ participant_name: 'Alice', message: 'A' }, {}, 'session-1', ctx1),
        handleDelegateTo({ participant_name: 'Bob', message: 'B' }, {}, 'session-1', ctx2),
      ])

      expect(ctx1._pendingDelegateMessages.get('r1')[0].sender).toBe('Alice')
      expect(ctx2._pendingDelegateMessages.get('r2')[0].sender).toBe('Bob')
    })
  })
})
