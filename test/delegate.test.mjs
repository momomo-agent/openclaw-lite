/**
 * test/delegate.test.mjs — Tests for core/delegate.js
 *
 * Covers: input validation, workspace agent routing, coding agent routing,
 * event bus lifecycle (delegate-start/token/end), message accumulation,
 * error recovery, and ctx state restoration.
 *
 * Dependencies (getWorkspace, buildSystemPrompt) are injected via ctx,
 * avoiding CJS require() mock issues in vitest ESM.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock event-bus — inject via ctx.eventBus for reliable CJS interception
const mockDispatch = vi.fn()
const mockOn = vi.fn()
const mockOff = vi.fn()
const mockEventBus = { dispatch: mockDispatch, on: mockOn, off: mockOff, emit: vi.fn() }

// ── Helpers ──

const mockBuildSystemPrompt = vi.fn(async () => 'You are a helpful assistant.')

function makeCtx(overrides = {}) {
  return {
    _activeRequestId: 'parent-req',
    _activeAbortController: new AbortController(),
    _pendingDelegateMessages: new Map(),
    // Injected dependencies (override CJS require() defaults)
    getWorkspace: vi.fn(() => null),
    buildSystemPrompt: mockBuildSystemPrompt,
    eventBus: mockEventBus,
    // Standard ctx
    pushStatus: vi.fn(),
    scrubMagicStrings: vi.fn((s) => s),
    executeTool: vi.fn(async () => 'tool result'),
    getToolsWithMcp: vi.fn(() => [
      { name: 'web_fetch', description: 'fetch', input_schema: {} },
      { name: 'delegate_to', description: 'delegate', input_schema: {} },
    ]),
    truncateToolResult: vi.fn((r) => String(r)),
    resolveSessionDb: vi.fn(() => '/mock/workspace'),
    configPath: vi.fn(() => '/tmp/paw-test-config-nonexistent.json'),
    loadConfig: vi.fn(() => ({ provider: 'anthropic', apiKey: 'k', model: 'test' })),
    sessionStore: {
      getSessionParticipants: vi.fn(() => []),
      loadSession: vi.fn(() => ({ messages: [] })),
    },
    streamAnthropic: vi.fn(async () => ({ answer: 'delegated response', toolSteps: [{ name: 'web_fetch', output: 'ok' }] })),
    streamOpenAI: vi.fn(async () => ({ answer: 'openai response', toolSteps: [] })),
    routeToCodingAgent: vi.fn(async () => 'coding agent response'),
    ...overrides,
  }
}

function setupCtxWorkspaces(ctx, workspaces) {
  const map = new Map(workspaces.map(w => [w.id, w]))
  ctx.getWorkspace.mockImplementation((id) => map.get(id) || null)
}

const { handleDelegateTo } = await import('../core/delegate.js')

// ── Tests ──

describe('handleDelegateTo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildSystemPrompt.mockResolvedValue('You are a helpful assistant.')
  })

  // ── Input validation ──

  describe('input validation', () => {
    it('returns error when participant_name is missing', async () => {
      const result = await handleDelegateTo({ message: 'hi' }, {}, 'session-1', makeCtx())
      expect(result).toBe('Error: participant_name and message are required')
    })

    it('returns error when message is missing', async () => {
      const result = await handleDelegateTo({ participant_name: 'Alice' }, {}, 'session-1', makeCtx())
      expect(result).toBe('Error: participant_name and message are required')
    })

    it('returns error when both are missing', async () => {
      const result = await handleDelegateTo({}, {}, 'session-1', makeCtx())
      expect(result).toBe('Error: participant_name and message are required')
    })

    it('returns error when sessionId is null', async () => {
      const result = await handleDelegateTo(
        { participant_name: 'Alice', message: 'hi' }, {}, null, makeCtx()
      )
      expect(result).toBe('Error: no active session')
    })

    it('returns error when resolveSessionDb returns null', async () => {
      const ctx = makeCtx({ resolveSessionDb: vi.fn(() => null) })
      const result = await handleDelegateTo(
        { participant_name: 'Alice', message: 'hi' }, {}, 'session-1', ctx
      )
      expect(result).toBe('Error: no active session')
    })
  })

  // ── Participant matching ──

  describe('participant matching', () => {
    it('returns not-found with available names listed', async () => {
      const ctx = makeCtx({
        sessionStore: {
          getSessionParticipants: vi.fn(() => ['ws-bob']),
          loadSession: vi.fn(() => ({ messages: [] })),
        },
      })
      setupCtxWorkspaces(ctx, [
        { id: 'ws-bob', type: 'local', path: '/bob', identity: { name: 'Bob' } }
      ])

      const result = await handleDelegateTo(
        { participant_name: 'Alice', message: 'hi' }, {}, 'session-1', ctx
      )
      expect(result).toContain('Error: participant "Alice" not found')
      expect(result).toContain('Bob')
    })

    it('matches participant name case-insensitively', async () => {
      const ctx = makeCtx({
        sessionStore: {
          getSessionParticipants: vi.fn(() => ['ws-alice']),
          loadSession: vi.fn(() => ({ messages: [] })),
        },
      })
      setupCtxWorkspaces(ctx, [
        { id: 'ws-alice', type: 'local', path: '/alice', identity: { name: 'Alice', avatar: '👩' } }
      ])

      const result = await handleDelegateTo(
        { participant_name: 'alice', message: 'hi' }, {}, 'session-1', ctx
      )
      expect(result).not.toContain('Error: participant')
      expect(ctx.streamAnthropic).toHaveBeenCalled()
    })

    it('matches by partial prefix', async () => {
      const ctx = makeCtx({
        sessionStore: {
          getSessionParticipants: vi.fn(() => ['ws-al']),
          loadSession: vi.fn(() => ({ messages: [] })),
        },
      })
      setupCtxWorkspaces(ctx, [
        { id: 'ws-al', type: 'local', path: '/al', identity: { name: 'Alice Designer' } }
      ])

      const result = await handleDelegateTo(
        { participant_name: 'Alice', message: 'hi' }, {}, 'session-1', ctx
      )
      expect(result).not.toContain('Error: participant')
    })
  })

  // ── Workspace agent (LLM participant) routing ──

  describe('workspace agent routing', () => {
    let ctx

    beforeEach(() => {
      ctx = makeCtx({
        sessionStore: {
          getSessionParticipants: vi.fn(() => ['ws-alice', 'ws-bob']),
          loadSession: vi.fn(() => ({
            messages: [
              { role: 'user', content: 'hello everyone' },
              { role: 'assistant', content: 'hi!', sender: 'Bob' },
            ]
          })),
        },
      })
      setupCtxWorkspaces(ctx, [
        { id: 'ws-alice', type: 'local', path: '/workspace/alice', identity: { name: 'Alice', avatar: '👩' } },
        { id: 'ws-bob', type: 'local', path: '/workspace/bob', identity: { name: 'Bob' } },
      ])
    })

    it('calls streamAnthropic with system prompt containing group context', async () => {
      await handleDelegateTo(
        { participant_name: 'Alice', message: 'what do you think?' },
        { apiKey: 'k', model: 'test' }, 'session-1', ctx
      )

      expect(ctx.streamAnthropic).toHaveBeenCalledTimes(1)
      const [messages, systemPrompt] = ctx.streamAnthropic.mock.calls[0]

      expect(systemPrompt).toContain('Alice')
      expect(systemPrompt).toContain('Group Chat')
      expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'what do you think?' })
    })

    it('builds system prompt from target workspace path', async () => {
      await handleDelegateTo(
        { participant_name: 'Alice', message: 'hi' }, {}, 'session-1', ctx
      )
      expect(mockBuildSystemPrompt).toHaveBeenCalledWith('/workspace/alice')
    })

    it('dispatches delegate-start and delegate-end events', async () => {
      await handleDelegateTo(
        { participant_name: 'Alice', message: 'hi' }, {}, 'session-1', ctx
      )

      const startCalls = mockDispatch.mock.calls.filter(c => c[0] === 'chat-delegate-start')
      const endCalls = mockDispatch.mock.calls.filter(c => c[0] === 'chat-delegate-end')

      expect(startCalls.length).toBe(1)
      expect(startCalls[0][1]).toMatchObject({
        requestId: 'parent-req',
        sender: 'Alice',
        workspaceId: 'ws-alice',
        avatar: '👩',
      })

      expect(endCalls.length).toBe(1)
      expect(endCalls[0][1]).toMatchObject({
        requestId: 'parent-req',
        sender: 'Alice',
        fullText: 'delegated response',
      })
    })

    it('registers and cleans up event remap handlers', async () => {
      await handleDelegateTo(
        { participant_name: 'Alice', message: 'hi' }, {}, 'session-1', ctx
      )

      expect(mockOn.mock.calls.length).toBe(5)
      expect(mockOff.mock.calls.length).toBe(5)

      const onChannels = mockOn.mock.calls.map(c => c[0]).sort()
      const offChannels = mockOff.mock.calls.map(c => c[0]).sort()
      expect(onChannels).toEqual(offChannels)
    })

    it('accumulates delegate message in _pendingDelegateMessages', async () => {
      await handleDelegateTo(
        { participant_name: 'Alice', message: 'hi' }, {}, 'session-1', ctx
      )

      const pending = ctx._pendingDelegateMessages.get('parent-req')
      expect(pending).toBeDefined()
      expect(pending.length).toBe(1)
      expect(pending[0]).toMatchObject({
        sender: 'Alice',
        senderWorkspaceId: 'ws-alice',
        content: 'delegated response',
      })
      expect(pending[0].toolSteps).toEqual([{ name: 'web_fetch', output: 'ok' }])
    })

    it('does not accumulate empty responses', async () => {
      ctx.streamAnthropic.mockResolvedValue({ answer: '   ', toolSteps: [] })
      await handleDelegateTo(
        { participant_name: 'Alice', message: 'hi' }, {}, 'session-1', ctx
      )

      expect(ctx._pendingDelegateMessages.has('parent-req')).toBe(false)
    })

    it('filters out delegate_to from delegate tools (no recursion)', async () => {
      await handleDelegateTo(
        { participant_name: 'Alice', message: 'hi' }, {}, 'session-1', ctx
      )

      const [, , , , delegateTools] = ctx.streamAnthropic.mock.calls[0]
      const toolNames = delegateTools.map(t => t.name)
      expect(toolNames).toContain('web_fetch')
      expect(toolNames).not.toContain('delegate_to')
    })

    it('restores ctx._activeRequestId after delegate', async () => {
      const originalRequestId = ctx._activeRequestId
      await handleDelegateTo(
        { participant_name: 'Alice', message: 'hi' }, {}, 'session-1', ctx
      )
      expect(ctx._activeRequestId).toBe(originalRequestId)
    })

    it('includes sender labels in conversation history', async () => {
      await handleDelegateTo(
        { participant_name: 'Alice', message: 'help' }, {}, 'session-1', ctx
      )

      const [messages] = ctx.streamAnthropic.mock.calls[0]
      const bobMsg = messages.find(m => m.role === 'assistant' && m.content.includes('[Bob]'))
      expect(bobMsg).toBeDefined()
    })

    it('returns preview with NO_REPLY instruction for orchestrator', async () => {
      const result = await handleDelegateTo(
        { participant_name: 'Alice', message: 'hi' }, {}, 'session-1', ctx
      )
      expect(result).toContain('[Alice responded directly to the user]')
      expect(result).toContain('delegated response')
      expect(result).toContain('NO_REPLY')
    })

    it('truncates long responses in orchestrator preview', async () => {
      ctx.streamAnthropic.mockResolvedValue({ answer: 'x'.repeat(500), toolSteps: [] })
      const result = await handleDelegateTo(
        { participant_name: 'Alice', message: 'hi' }, {}, 'session-1', ctx
      )
      expect(result).toContain('…')
    })
  })

  // ── Coding agent routing ──

  describe('coding agent routing', () => {
    let ctx

    beforeEach(() => {
      ctx = makeCtx({
        sessionStore: {
          getSessionParticipants: vi.fn(() => ['ws-owner', 'ws-claude']),
          loadSession: vi.fn(() => ({ messages: [] })),
        },
      })
      setupCtxWorkspaces(ctx, [
        { id: 'ws-claude', type: 'coding-agent', engine: 'claude', path: '/projects/myapp', identity: { name: 'Claude', avatar: '🤖' } },
        { id: 'ws-owner', type: 'local', path: '/workspace/owner', identity: { name: 'Owner' } },
      ])
    })

    it('routes to coding agent via ctx.routeToCodingAgent', async () => {
      await handleDelegateTo(
        { participant_name: 'Claude', message: 'fix the bug' }, {}, 'session-1', ctx
      )

      expect(ctx.routeToCodingAgent).toHaveBeenCalledTimes(1)
      const [ws, msg, opts] = ctx.routeToCodingAgent.mock.calls[0]
      expect(ws).toMatchObject({ id: 'ws-claude', type: 'coding-agent', engine: 'claude' })
      expect(msg).toBe('fix the bug')
      expect(opts).toMatchObject({
        sessionId: 'session-1',
        requestId: 'parent-req',
        senderName: 'Claude',
        senderAvatar: '🤖',
      })
    })

    it('does NOT call streamAnthropic for coding agents', async () => {
      await handleDelegateTo(
        { participant_name: 'Claude', message: 'fix the bug' }, {}, 'session-1', ctx
      )
      expect(ctx.streamAnthropic).not.toHaveBeenCalled()
      expect(ctx.streamOpenAI).not.toHaveBeenCalled()
    })

    it('accumulates coding agent response in _pendingDelegateMessages', async () => {
      await handleDelegateTo(
        { participant_name: 'Claude', message: 'fix it' }, {}, 'session-1', ctx
      )

      const pending = ctx._pendingDelegateMessages.get('parent-req')
      expect(pending).toBeDefined()
      expect(pending.length).toBe(1)
      expect(pending[0]).toMatchObject({
        sender: 'Claude',
        senderWorkspaceId: 'ws-claude',
        content: 'coding agent response',
      })
    })

    it('returns coding agent response directly', async () => {
      const result = await handleDelegateTo(
        { participant_name: 'Claude', message: 'fix it' }, {}, 'session-1', ctx
      )
      expect(result).toBe('coding agent response')
    })

    it('uses default avatar when identity.avatar is missing', async () => {
      const ctx2 = makeCtx({
        sessionStore: {
          getSessionParticipants: vi.fn(() => ['ws-codex']),
          loadSession: vi.fn(() => ({ messages: [] })),
        },
      })
      setupCtxWorkspaces(ctx2, [
        { id: 'ws-codex', type: 'coding-agent', engine: 'codex', path: '/projects/app', identity: { name: 'Codex' } },
      ])

      await handleDelegateTo(
        { participant_name: 'Codex', message: 'test' }, {}, 'session-1', ctx2
      )

      const [, , opts] = ctx2.routeToCodingAgent.mock.calls[0]
      expect(opts.senderAvatar).toBe('🤖')
    })

    it('does not accumulate empty coding agent responses', async () => {
      ctx.routeToCodingAgent.mockResolvedValue('   ')
      await handleDelegateTo(
        { participant_name: 'Claude', message: 'hi' }, {}, 'session-1', ctx
      )
      expect(ctx._pendingDelegateMessages.has('parent-req')).toBe(false)
    })
  })

  // ── Error recovery ──

  describe('error recovery', () => {
    let ctx

    beforeEach(() => {
      ctx = makeCtx({
        sessionStore: {
          getSessionParticipants: vi.fn(() => ['ws-alice']),
          loadSession: vi.fn(() => ({ messages: [] })),
        },
      })
      setupCtxWorkspaces(ctx, [
        { id: 'ws-alice', type: 'local', path: '/workspace/alice', identity: { name: 'Alice', avatar: '👩' } },
      ])
    })

    it('dispatches delegate-end with error on streamAnthropic failure', async () => {
      ctx.streamAnthropic.mockRejectedValue(new Error('API timeout'))

      const result = await handleDelegateTo(
        { participant_name: 'Alice', message: 'hi' }, {}, 'session-1', ctx
      )

      expect(result).toContain('Error delegating to Alice')
      expect(result).toContain('API timeout')

      const endCalls = mockDispatch.mock.calls.filter(c => c[0] === 'chat-delegate-end')
      expect(endCalls.length).toBe(1)
      expect(endCalls[0][1].fullText).toContain('Error: API timeout')
    })

    it('restores ctx state after error', async () => {
      const originalReqId = ctx._activeRequestId
      const originalAbort = ctx._activeAbortController

      ctx.streamAnthropic.mockRejectedValue(new Error('boom'))

      await handleDelegateTo(
        { participant_name: 'Alice', message: 'hi' }, {}, 'session-1', ctx
      )

      expect(ctx._activeRequestId).toBe(originalReqId)
      expect(ctx._activeAbortController).toBe(originalAbort)
    })

    it('cleans up event remap handlers on error', async () => {
      ctx.streamAnthropic.mockRejectedValue(new Error('boom'))

      await handleDelegateTo(
        { participant_name: 'Alice', message: 'hi' }, {}, 'session-1', ctx
      )

      expect(mockOn.mock.calls.length).toBe(mockOff.mock.calls.length)
    })
  })

  // ── Edge cases ──

  describe('edge cases', () => {
    it('handles null session from loadSession', async () => {
      const ctx = makeCtx({
        sessionStore: {
          getSessionParticipants: vi.fn(() => ['ws-a']),
          loadSession: vi.fn(() => null),
        },
      })
      setupCtxWorkspaces(ctx, [
        { id: 'ws-a', type: 'local', path: '/a', identity: { name: 'A' } }
      ])

      await handleDelegateTo(
        { participant_name: 'A', message: 'hi' }, {}, 'session-1', ctx
      )

      expect(ctx.streamAnthropic).toHaveBeenCalled()
      const [messages] = ctx.streamAnthropic.mock.calls[0]
      expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'hi' })
    })

    it('handles loadSession throwing gracefully', async () => {
      const ctx = makeCtx({
        sessionStore: {
          getSessionParticipants: vi.fn(() => ['ws-a']),
          loadSession: vi.fn(() => { throw new Error('db locked') }),
        },
      })
      setupCtxWorkspaces(ctx, [
        { id: 'ws-a', type: 'local', path: '/a', identity: { name: 'A' } }
      ])

      const result = await handleDelegateTo(
        { participant_name: 'A', message: 'hi' }, {}, 'session-1', ctx
      )
      expect(result).toContain('[A responded directly to the user]')
    })

    it('skips delegate events when _activeRequestId is null', async () => {
      const ctx = makeCtx({
        _activeRequestId: null,
        sessionStore: {
          getSessionParticipants: vi.fn(() => ['ws-a']),
          loadSession: vi.fn(() => ({ messages: [] })),
        },
      })
      setupCtxWorkspaces(ctx, [
        { id: 'ws-a', type: 'local', path: '/a', identity: { name: 'A' } }
      ])

      await handleDelegateTo(
        { participant_name: 'A', message: 'hi' }, {}, 'session-1', ctx
      )

      const startCalls = mockDispatch.mock.calls.filter(c => c[0] === 'chat-delegate-start')
      expect(startCalls.length).toBe(0)
    })
  })
})
