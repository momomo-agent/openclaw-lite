/**
 * test/chat-pipeline.test.mjs — Tests for core/chat-pipeline.js
 *
 * Tests the pure functions extracted from _runChat in M36.
 */
import { describe, it, expect, vi } from 'vitest'

// Import the pipeline functions
const { buildConversationHistory, buildUserContent, injectGroupChatContext, injectTeammateContext, buildFailoverList } = await import('../core/chat-pipeline.js')

describe('buildConversationHistory', () => {
  it('uses rawMessages when provided', () => {
    const msgs = buildConversationHistory({
      rawMessages: [{ role: 'user', content: 'hello' }],
      history: [{ prompt: 'ignored' }],
    })
    expect(msgs).toEqual([{ role: 'user', content: 'hello' }])
  })

  it('converts history format to messages', () => {
    const msgs = buildConversationHistory({
      history: [
        { prompt: 'hi', answer: 'hello' },
        { prompt: 'how are you', answer: 'good' },
      ],
    })
    expect(msgs).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'how are you' },
      { role: 'assistant', content: 'good' },
    ])
  })

  it('skips empty answers in history', () => {
    const msgs = buildConversationHistory({
      history: [
        { prompt: 'hi', answer: '' },
        { prompt: 'again', answer: '  ' },
      ],
    })
    expect(msgs).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'user', content: 'again' },
    ])
  })

  it('loads from SQLite when no rawMessages or history', () => {
    const mockStore = {
      loadSession: vi.fn(() => ({
        messages: [
          { role: 'user', content: 'from db' },
          { role: 'assistant', content: 'response', sender: 'Bot' },
        ],
      })),
    }
    const msgs = buildConversationHistory({
      sessionId: 'sess-1',
      sessionDb: '/tmp/ws',
      isGroupChat: false,
      sessionStore: mockStore,
    })
    expect(msgs).toEqual([
      { role: 'user', content: 'from db' },
      { role: 'assistant', content: 'response' },
    ])
  })

  it('annotates sender in group chat messages from SQLite', () => {
    const mockStore = {
      loadSession: vi.fn(() => ({
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello', sender: 'CodeBot' },
        ],
      })),
    }
    const msgs = buildConversationHistory({
      sessionId: 'sess-1',
      sessionDb: '/tmp/ws',
      isGroupChat: true,
      sessionStore: mockStore,
    })
    expect(msgs[1].content).toBe('[CodeBot]: hello')
  })

  it('returns empty array when no source', () => {
    const msgs = buildConversationHistory({})
    expect(msgs).toEqual([])
  })
})

describe('buildUserContent', () => {
  it('handles text-only prompt', () => {
    const { userContent, fileContext } = buildUserContent('hello', [])
    expect(userContent).toEqual([])
    expect(fileContext).toBe('')
  })

  it('adds file path context for non-image files', () => {
    const { fileContext } = buildUserContent('check this', [
      { path: '/tmp/test.txt', type: 'text/plain' },
    ])
    expect(fileContext).toContain('/tmp/test.txt')
  })
})

describe('injectGroupChatContext', () => {
  it('returns unchanged prompt for non-group sessions', () => {
    const result = injectGroupChatContext({
      systemPrompt: 'base prompt',
      sessionId: null,
      sessionDb: null,
    })
    expect(result.systemPrompt).toBe('base prompt')
    expect(result.isGroupChat).toBe(false)
    expect(result.extraTools).toEqual([])
  })

  it('injects orchestrator prompt for multi-participant sessions', () => {
    const mockStore = {
      getSessionParticipants: vi.fn(() => ['ws-1', 'ws-2']),
    }
    const mockRegistry = {
      getWorkspace: vi.fn((id) => ({
        identity: { name: id === 'ws-1' ? 'Alice' : 'Bob' },
      })),
    }
    const DELEGATE = { name: 'delegate_to' }
    const SILENT = { name: 'stay_silent' }

    const result = injectGroupChatContext({
      systemPrompt: 'base',
      sessionId: 'sess-1',
      sessionDb: '/tmp/ws',
      sessionStore: mockStore,
      workspaceRegistry: mockRegistry,
      targetWorkspaceId: null,
      DELEGATE_TO_TOOL: DELEGATE,
      STAY_SILENT_TOOL: SILENT,
    })

    expect(result.isGroupChat).toBe(true)
    expect(result.systemPrompt).toContain('Group Chat')
    expect(result.systemPrompt).toContain('Alice')
    expect(result.systemPrompt).toContain('Bob')
    expect(result.extraTools).toContain(DELEGATE)
    expect(result.extraTools).toContain(SILENT)
  })
})

describe('injectTeammateContext', () => {
  it('returns unchanged prompt when no agent', () => {
    const result = injectTeammateContext('base', { agent: null })
    expect(result).toBe('base')
  })

  it('injects teammate messages', () => {
    const mockStore = {
      loadSession: vi.fn(() => ({
        messages: [
          { role: 'assistant', content: 'hi from bob', sender: 'Bob' },
          { role: 'assistant', content: 'my own msg', sender: 'Alice' },
        ],
      })),
    }
    const result = injectTeammateContext('base', {
      agent: { name: 'Alice' },
      sessionId: 'sess-1',
      sessionDb: '/tmp/ws',
      sessionStore: mockStore,
    })
    expect(result).toContain('Teammate Bob')
    expect(result).not.toContain('Teammate Alice')
  })
})

describe('buildFailoverList', () => {
  it('returns primary model when no fallbacks', () => {
    const fm = { isAvailable: vi.fn(() => true) }
    const list = buildFailoverList('claude-sonnet', 'anthropic', {}, fm)
    expect(list).toEqual([{ model: 'claude-sonnet', provider: 'anthropic' }])
  })

  it('includes fallback models', () => {
    const fm = { isAvailable: vi.fn(() => true) }
    const list = buildFailoverList('claude-sonnet', 'anthropic', {
      fallbackModels: ['openai/gpt-4o', 'claude-haiku'],
    }, fm)
    expect(list).toHaveLength(3)
    expect(list[1]).toEqual({ model: 'gpt-4o', provider: 'openai' })
    expect(list[2]).toEqual({ model: 'claude-haiku', provider: 'anthropic' })
  })

  it('falls back to primary when all in cooldown', () => {
    const fm = { isAvailable: vi.fn(() => false) }
    const list = buildFailoverList('claude-sonnet', 'anthropic', {
      fallbackModels: ['gpt-4o'],
    }, fm)
    expect(list).toEqual([{ model: 'claude-sonnet', provider: 'anthropic' }])
  })
})
