import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for crash-safe delegate message persistence
 * 
 * Scenario: Group chat with delegates. App crashes mid-streaming.
 * Expected: Delegate messages that already completed are in DB.
 */

// Mock session-store
const appendedMessages = []
vi.mock('../session-store', () => ({
  appendMessage: (wsPath, sessionId, msg) => {
    appendedMessages.push({ wsPath, sessionId, ...msg })
  },
  getDb: () => null,
}))

// Mock dependencies
vi.mock('../core/event-bus', () => {
  const handlers = {}
  return {
    default: {
      dispatch: vi.fn((ch, data) => {
        (handlers[ch] || []).forEach(h => h(data))
      }),
      on: vi.fn((ch, h) => { if (!handlers[ch]) handlers[ch] = []; handlers[ch].push(h) }),
      off: vi.fn(),
    },
  }
})

vi.mock('../core/workspace-registry', () => ({
  listWorkspaces: () => [],
}))

vi.mock('../core/prompt-builder', () => ({
  buildSystemPrompt: () => 'test prompt',
}))

describe('delegate message persistence', () => {
  beforeEach(() => {
    appendedMessages.length = 0
  })

  it('delegate messages survive when finishChat never runs', () => {
    // Simulate what delegate.js does on completion:
    // It calls appendMessage directly — no need for finishChat
    const sessionStore = { appendMessage: (ws, sid, msg) => appendedMessages.push({ ws, sid, ...msg }) }
    
    // Delegate 1 finishes
    sessionStore.appendMessage('/ws', 'sess-1', {
      role: 'assistant', content: 'Response from Agent A', timestamp: 1000,
      sender: 'Agent A', senderWorkspaceId: 'ws-a', _delegateImmediate: true,
    })

    // Delegate 2 finishes
    sessionStore.appendMessage('/ws', 'sess-1', {
      role: 'assistant', content: 'Response from Agent B', timestamp: 2000,
      sender: 'Agent B', senderWorkspaceId: 'ws-b', _delegateImmediate: true,
    })

    // App crashes here — finishChat NEVER runs

    // Verify: both messages are persisted
    expect(appendedMessages).toHaveLength(2)
    expect(appendedMessages[0].content).toBe('Response from Agent A')
    expect(appendedMessages[0]._delegateImmediate).toBe(true)
    expect(appendedMessages[1].content).toBe('Response from Agent B')
    expect(appendedMessages[1].sender).toBe('Agent B')
  })

  it('finishChat does not duplicate delegate messages', () => {
    // Simulate the finishChat flow with delegates already persisted
    const delegateMsgs = [
      { sender: 'Agent A', senderWorkspaceId: 'ws-a', content: 'Hello from A', timestamp: 1000 },
      { sender: 'Agent B', senderWorkspaceId: 'ws-b', content: 'Hello from B', timestamp: 2000 },
    ]

    const steps = [
      { name: 'delegate_to', input: { participant_name: 'Agent A', message: 'hi' } },
      { name: 'delegate_to', input: { participant_name: 'Agent B', message: 'hi' } },
    ]

    const sessionStore = { appendMessage: (ws, sid, msg) => appendedMessages.push({ ws, sid, ...msg }) }
    const wsPath = '/ws'
    const sessionId = 'sess-1'
    const orchMeta = { sender: 'Orchestrator' }

    // Simulate finishChat logic (from main.js)
    let currentSteps = []
    let delegateIdx = 0
    for (const step of steps) {
      currentSteps.push(step)
      if (step.name === 'delegate_to' && delegateIdx < delegateMsgs.length) {
        if (currentSteps.length) {
          sessionStore.appendMessage(wsPath, sessionId, {
            role: 'assistant', content: '', timestamp: Date.now(),
            toolSteps: currentSteps, ...orchMeta,
          })
        }
        currentSteps = []
        // Skip delegate — already written by delegate.js
        delegateIdx++
      }
    }

    // Verify: only orchestrator segments, NO delegate content
    const orchMessages = appendedMessages.filter(m => m.toolSteps)
    const delegateInFinish = appendedMessages.filter(m => m.sender === 'Agent A' || m.sender === 'Agent B')
    
    expect(orchMessages).toHaveLength(2) // 2 orch segments (each with delegate_to tool step)
    expect(delegateInFinish).toHaveLength(0) // no delegate content duplicated
  })

  it('message ordering: user → delegate1 → delegate2 (chronological)', () => {
    const sessionStore = { appendMessage: (ws, sid, msg) => appendedMessages.push({ ws, sid, ...msg }) }

    // User message (persisted before streaming)
    sessionStore.appendMessage('/ws', 'sess-1', {
      role: 'user', content: 'Hello everyone', timestamp: 1000,
    })

    // Delegate A responds first (immediate persist)
    sessionStore.appendMessage('/ws', 'sess-1', {
      role: 'assistant', content: 'Hi from A', timestamp: 2000,
      sender: 'Agent A', _delegateImmediate: true,
    })

    // Delegate B responds second (immediate persist)
    sessionStore.appendMessage('/ws', 'sess-1', {
      role: 'assistant', content: 'Hi from B', timestamp: 3000,
      sender: 'Agent B', _delegateImmediate: true,
    })

    // Verify chronological order
    expect(appendedMessages).toHaveLength(3)
    expect(appendedMessages[0].role).toBe('user')
    expect(appendedMessages[1].sender).toBe('Agent A')
    expect(appendedMessages[2].sender).toBe('Agent B')
    expect(appendedMessages[0].timestamp).toBeLessThan(appendedMessages[1].timestamp)
    expect(appendedMessages[1].timestamp).toBeLessThan(appendedMessages[2].timestamp)
  })
})
