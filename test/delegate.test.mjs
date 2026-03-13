/**
 * test/delegate.test.mjs — Tests for core/delegate.js
 *
 * Tests the group chat delegate_to handler extracted in M39.
 * Note: delegate.js uses CJS require() for workspace-registry and prompt-builder,
 * which can't be mocked from ESM tests. Tests focus on input validation and
 * ctx-based behavior that doesn't depend on deep CJS mock chains.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock event-bus
vi.mock('../core/event-bus', () => ({
  default: { dispatch: vi.fn(), on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  __esModule: false,
}))

function makeCtx(overrides = {}) {
  return {
    _activeRequestId: 'parent-req',
    _activeAbortController: new AbortController(),
    _pendingDelegateMessages: new Map(),
    pushStatus: vi.fn(),
    scrubMagicStrings: vi.fn((s) => s),
    executeTool: vi.fn(async () => 'tool result'),
    getToolsWithMcp: vi.fn(() => [{ name: 'web_fetch', description: 'fetch', input_schema: {} }]),
    truncateToolResult: vi.fn((r) => String(r)),
    resolveSessionDb: vi.fn(() => 'mock-db'),
    configPath: vi.fn(() => '/tmp/config.json'),
    loadConfig: vi.fn(() => ({ provider: 'anthropic', apiKey: 'k', model: 'test' })),
    sessionStore: {
      getSessionParticipants: vi.fn(() => []),
      loadSession: vi.fn(() => ({ messages: [] })),
    },
    streamAnthropic: vi.fn(async () => ({ answer: 'delegated response', toolSteps: [] })),
    streamOpenAI: vi.fn(async () => ({ answer: 'openai response', toolSteps: [] })),
    routeToCodingAgent: vi.fn(async () => 'coding agent response'),
    ...overrides,
  }
}

const { handleDelegateTo } = await import('../core/delegate.js')

describe('handleDelegateTo', () => {
  it('returns error when participant_name is missing', async () => {
    const ctx = makeCtx()
    const result = await handleDelegateTo({ message: 'hi' }, {}, 'session-1', ctx)
    expect(result).toBe('Error: participant_name and message are required')
  })

  it('returns error when message is missing', async () => {
    const ctx = makeCtx()
    const result = await handleDelegateTo({ participant_name: 'Alice' }, {}, 'session-1', ctx)
    expect(result).toBe('Error: participant_name and message are required')
  })

  it('returns error when sessionId is null and resolveSessionDb returns null', async () => {
    const ctx = makeCtx({ resolveSessionDb: vi.fn(() => null) })
    const result = await handleDelegateTo(
      { participant_name: 'Alice', message: 'hi' },
      {}, null, ctx
    )
    expect(result).toBe('Error: no active session')
  })

  it('returns error when resolveSessionDb returns null', async () => {
    const ctx = makeCtx({ resolveSessionDb: vi.fn(() => null) })
    const result = await handleDelegateTo(
      { participant_name: 'Alice', message: 'hi' },
      {}, 'session-1', ctx
    )
    expect(result).toBe('Error: no active session')
  })

  it('returns not found error when no participants match', async () => {
    // sessionStore returns empty participant list → no workspace matches → not found
    const ctx = makeCtx({
      sessionStore: {
        getSessionParticipants: vi.fn(() => []),
        loadSession: vi.fn(() => ({ messages: [] })),
      },
    })
    const result = await handleDelegateTo(
      { participant_name: 'Alice', message: 'hi' },
      {}, 'session-1', ctx
    )
    expect(result).toContain('Error: participant "Alice" not found')
  })
})
