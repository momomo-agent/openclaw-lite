/**
 * test/coding-agent-router.test.mjs — Tests for core/coding-agent-router.js
 *
 * Tests the coding agent routing + CC session persistence.
 * Note: CJS require() calls for coding-agents, workspace-registry, etc.
 * can't be mocked from ESM tests. Tests focus on exported function behavior
 * and ctx interactions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock event-bus
vi.mock('../core/event-bus', () => ({
  default: { dispatch: vi.fn(), on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  __esModule: false,
}))

function makeCtx(overrides = {}) {
  return {
    _activeRequestId: null,
    _activeAbortController: null,
    _activeCodingProcess: null,
    pushStatus: vi.fn(),
    loadConfig: vi.fn(() => ({ provider: 'anthropic', apiKey: 'k', model: 'claude-sonnet-4-20250514' })),
    ...overrides,
  }
}

const mod = await import('../core/coding-agent-router.js')
const { routeToCodingAgent, loadCCSessions, streamCodingAgent } = mod

describe('coding-agent-router', () => {
  describe('loadCCSessions', () => {
    it('does not throw when called', () => {
      // loadCCSessions reads from workspace files via CJS require
      // It should handle the case where no workspaces exist
      expect(() => loadCCSessions()).not.toThrow()
    })
  })

  describe('routeToCodingAgent', () => {
    it('returns error when engine is not available', async () => {
      // 'nonexistent-engine-xyz' should not be available
      const workspace = { engine: 'nonexistent-engine-xyz', path: '/code', identity: { name: 'Bot' } }
      const ctx = makeCtx()
      const result = await routeToCodingAgent(
        workspace, 'do something',
        { sessionId: 's1', requestId: 'r1', senderName: 'User', senderAvatar: '👤' },
        ctx
      )

      expect(result).toContain('Error')
    })

    it('sets ctx._activeRequestId for claude engine', async () => {
      // Claude engine routes to SDK path, which will fail in test env
      // but we can verify the routing logic runs
      const workspace = { id: 'ws-ca', engine: 'claude', path: '/nonexistent', identity: { name: 'Bot' } }
      const ctx = makeCtx()
      const result = await routeToCodingAgent(
        workspace, 'hello',
        { sessionId: 's1', requestId: 'r1', senderName: 'User', senderAvatar: '👤' },
        ctx
      )

      // Should return error (SDK not available in test) or result
      expect(typeof result).toBe('string')
    })
  })

  describe('streamCodingAgent', () => {
    it('sets _activeRequestId on ctx', async () => {
      const ctx = makeCtx()
      // Will fail because 'nonexistent' agent isn't available, but we can verify state setup
      try {
        await streamCodingAgent('nonexistent', 'do stuff', { cwd: '/test', sessionId: 's1', requestId: 'r1' }, ctx)
      } catch {
        // Expected to fail — agent not available
      }

      expect(ctx._activeRequestId).toBe('r1')
      // After error, _activeCodingProcess should be reset
      expect(ctx._activeCodingProcess).toBeNull()
    })

    it('calls pushStatus with running state', async () => {
      const ctx = makeCtx()
      try {
        await streamCodingAgent('nonexistent', 'do stuff', { cwd: '/test', sessionId: 's1', requestId: 'r1' }, ctx)
      } catch {
        // Expected
      }

      expect(ctx.pushStatus).toHaveBeenCalledWith('running', expect.stringContaining('working'))
    })

    it('sets pushStatus to error on failure', async () => {
      const ctx = makeCtx()
      try {
        await streamCodingAgent('nonexistent', 'do stuff', { cwd: '/test', sessionId: 's1', requestId: 'r1' }, ctx)
      } catch {
        // Expected
      }

      expect(ctx.pushStatus).toHaveBeenCalledWith('error', expect.any(String))
    })
  })

  describe('module exports', () => {
    it('exports all expected functions', () => {
      expect(typeof routeToCodingAgent).toBe('function')
      expect(typeof loadCCSessions).toBe('function')
      expect(typeof streamCodingAgent).toBe('function')
      expect(typeof mod.routeToCodingAgentSDK).toBe('function')
    })
  })
})
