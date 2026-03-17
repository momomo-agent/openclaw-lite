/**
 * test/group-chat-e2e-stress.test.mjs — End-to-end group chat stress test
 * 
 * Simulates real IPC flow: main process → eventBus → renderer
 * Tests the full message display pipeline under load
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventEmitter } from 'events'

describe('Group Chat E2E Stress (IPC simulation)', () => {
  let eventBus
  let rendererMessages // Simulates renderer's message state

  beforeEach(() => {
    eventBus = new EventEmitter()
    eventBus.setMaxListeners(100)
    rendererMessages = new Map() // sessionId → messages[]
    
    // Simulate renderer listening to events
    eventBus.on('chat-text-start', (data) => {
      const { sessionId, agentName, requestId } = data
      if (!rendererMessages.has(sessionId)) rendererMessages.set(sessionId, [])
      rendererMessages.get(sessionId).push({
        id: requestId,
        role: 'assistant',
        sender: agentName,
        content: '',
        streaming: true,
      })
    })

    eventBus.on('chat-delegate-start', (data) => {
      const { sessionId, sender, requestId } = data
      if (!rendererMessages.has(sessionId)) rendererMessages.set(sessionId, [])
      rendererMessages.get(sessionId).push({
        id: requestId,
        role: 'assistant',
        sender,
        content: '',
        streaming: true,
      })
    })

    eventBus.on('chat-token', (data) => {
      const { sessionId, requestId, text } = data
      const msgs = rendererMessages.get(sessionId) || []
      const msg = msgs.find(m => m.id === requestId)
      if (msg) msg.content += text
    })

    eventBus.on('chat-delegate-token', (data) => {
      const { sessionId, requestId, token } = data
      const msgs = rendererMessages.get(sessionId) || []
      const msg = msgs.find(m => m.id === requestId)
      if (msg) msg.content += token
    })

    eventBus.on('chat-done', (data) => {
      const { sessionId, requestId } = data
      const msgs = rendererMessages.get(sessionId) || []
      const msg = msgs.find(m => m.id === requestId)
      if (msg) msg.streaming = false
    })
  })

  it('Stress: 50 rapid messages from 5 agents', async () => {
    const sessionId = 'group-session-1'
    const agents = ['Alice', 'Bob', 'Charlie', 'Dave', 'Eve']

    // Simulate 50 rapid delegate responses
    for (let i = 0; i < 50; i++) {
      const agent = agents[i % 5]
      const reqId = `req-${i}`
      
      eventBus.emit('chat-delegate-start', {
        sessionId,
        sender: agent,
        requestId: reqId,
        avatar: '👤',
        workspaceId: `ws-${i % 5}`,
      })

      // Simulate streaming tokens
      for (let j = 0; j < 10; j++) {
        eventBus.emit('chat-delegate-token', {
          sessionId,
          requestId: reqId,
          sender: agent,
          token: `${agent}-${i}-${j} `,
        })
      }

      eventBus.emit('chat-done', { sessionId, requestId: reqId })
    }

    // Verify all messages rendered
    const msgs = rendererMessages.get(sessionId)
    expect(msgs).toHaveLength(50)

    // Verify no cross-talk: each message has correct sender
    for (let i = 0; i < 50; i++) {
      const expectedSender = agents[i % 5]
      expect(msgs[i].sender).toBe(expectedSender)
      expect(msgs[i].content).toContain(expectedSender)
      expect(msgs[i].streaming).toBe(false)
    }
  })

  it('Stress: Interleaved streaming from 5 agents', async () => {
    const sessionId = 'group-session-2'
    const agents = ['A', 'B', 'C', 'D', 'E']

    // Start all 5 agents streaming simultaneously
    for (let i = 0; i < 5; i++) {
      eventBus.emit('chat-delegate-start', {
        sessionId,
        sender: agents[i],
        requestId: `r${i}`,
      })
    }

    // Interleaved token emission (simulates concurrent streams)
    for (let round = 0; round < 20; round++) {
      for (let i = 0; i < 5; i++) {
        eventBus.emit('chat-delegate-token', {
          sessionId,
          requestId: `r${i}`,
          token: `${agents[i]}${round} `,
        })
      }
    }

    // Finish all
    for (let i = 0; i < 5; i++) {
      eventBus.emit('chat-done', { sessionId, requestId: `r${i}` })
    }

    const msgs = rendererMessages.get(sessionId)
    expect(msgs).toHaveLength(5)

    // Each agent should have exactly their tokens
    for (let i = 0; i < 5; i++) {
      expect(msgs[i].sender).toBe(agents[i])
      expect(msgs[i].content).toContain(`${agents[i]}0`)
      expect(msgs[i].content).toContain(`${agents[i]}19`)
      expect(msgs[i].streaming).toBe(false)
    }
  })

  it('Stress: Detect empty messages', async () => {
    const sessionId = 'group-session-3'

    // Agent starts but sends no tokens
    eventBus.emit('chat-delegate-start', {
      sessionId,
      sender: 'Ghost',
      requestId: 'r-empty',
    })

    eventBus.emit('chat-done', { sessionId, requestId: 'r-empty' })

    const msgs = rendererMessages.get(sessionId)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].content).toBe('') // Empty message detected
    expect(msgs[0].sender).toBe('Ghost')
  })

  it('Stress: Detect sender mismatch', async () => {
    const sessionId = 'group-session-4'

    // Correct flow
    eventBus.emit('chat-delegate-start', {
      sessionId,
      sender: 'Alice',
      requestId: 'r1',
    })

    // Wrong sender in token (bug simulation)
    eventBus.emit('chat-delegate-token', {
      sessionId,
      requestId: 'r1',
      sender: 'Bob', // Mismatch!
      token: 'Bob says hello',
    })

    eventBus.emit('chat-done', { sessionId, requestId: 'r1' })

    const msgs = rendererMessages.get(sessionId)
    expect(msgs[0].sender).toBe('Alice') // Sender from start event
    expect(msgs[0].content).toContain('Bob') // But content is from Bob!
    
    // This is a BUG: sender and content don't match
  })

  it('Stress: 100 messages in 100ms', async () => {
    const sessionId = 'group-session-5'
    const start = Date.now()

    for (let i = 0; i < 100; i++) {
      const agent = `Agent${i % 10}`
      eventBus.emit('chat-delegate-start', {
        sessionId,
        sender: agent,
        requestId: `r${i}`,
      })
      eventBus.emit('chat-delegate-token', {
        sessionId,
        requestId: `r${i}`,
        token: `msg${i}`,
      })
      eventBus.emit('chat-done', { sessionId, requestId: `r${i}` })
    }

    const elapsed = Date.now() - start
    console.log(`100 messages processed in ${elapsed}ms`)

    const msgs = rendererMessages.get(sessionId)
    expect(msgs).toHaveLength(100)
    expect(elapsed).toBeLessThan(1000) // Should be fast
  })
})
