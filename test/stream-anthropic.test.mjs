/**
 * test/stream-anthropic.test.mjs — Tests for core/stream-anthropic.js
 *
 * Tests the Anthropic SSE streaming engine extracted in M39.
 * Mocks global fetch since CJS require() can't be intercepted from ESM tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock event-bus (used via require() in the source)
vi.mock('../core/event-bus', () => ({
  default: { dispatch: vi.fn(), on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  __esModule: false,
}))

// Mock global fetch — this is what api-retry.js actually calls
const originalFetch = globalThis.fetch

function mockSSEResponse(events) {
  const lines = events.map(e => `data: ${JSON.stringify(e)}`).join('\n') + '\n'
  const encoder = new TextEncoder()
  const data = encoder.encode(lines)
  let read = false
  return {
    ok: true,
    status: 200,
    headers: new Map(),
    body: {
      getReader: () => ({
        read: () => {
          if (!read) { read = true; return Promise.resolve({ done: false, value: data }) }
          return Promise.resolve({ done: true })
        },
      }),
    },
  }
}

function makeCtx(overrides = {}) {
  return {
    _activeRequestId: null,
    _activeAbortController: null,
    pushStatus: vi.fn(),
    scrubMagicStrings: vi.fn((s) => s),
    isContextOverflowError: vi.fn(() => false),
    compactHistory: vi.fn(),
    truncateToolResult: vi.fn((r) => String(r)),
    executeTool: vi.fn(async () => 'tool result'),
    getToolsWithMcp: vi.fn(() => []),
    ...overrides,
  }
}

// Import the module (will use real require() for its deps)
const { streamAnthropic } = await import('../core/stream-anthropic.js')

describe('streamAnthropic', () => {
  let mockFetch

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns text from a simple text-only response', async () => {
    const events = [
      { type: 'message_start', message: { usage: { input_tokens: 10 } } },
      { type: 'content_block_delta', delta: { text: 'Hello ' } },
      { type: 'content_block_delta', delta: { text: 'world' } },
      { type: 'message_delta', usage: { output_tokens: 5 } },
    ]
    mockFetch.mockResolvedValueOnce(mockSSEResponse(events))

    const ctx = makeCtx()
    const result = await streamAnthropic(
      [{ role: 'user', content: 'hi' }],
      'You are helpful',
      { model: 'claude-sonnet-4-20250514', apiKey: 'sk-test' },
      'req-1', [], null, null, ctx
    )

    expect(result.answer).toBe('Hello world')
    expect(result.usage.inputTokens).toBe(10)
    expect(result.usage.outputTokens).toBe(5)
    expect(ctx.pushStatus).toHaveBeenCalledWith('thinking', 'Thinking...')
    expect(ctx.pushStatus).toHaveBeenCalledWith('done', 'Done')
  })

  it('sets _activeRequestId and _activeAbortController on ctx', async () => {
    mockFetch.mockResolvedValueOnce(mockSSEResponse([
      { type: 'content_block_delta', delta: { text: 'ok' } },
    ]))

    const ctx = makeCtx()
    await streamAnthropic(
      [{ role: 'user', content: 'test' }],
      '', { model: 'test', apiKey: 'k' },
      'req-42', [], null, null, ctx
    )

    expect(ctx._activeRequestId).toBe('req-42')
    expect(ctx._activeAbortController).toBeInstanceOf(AbortController)
  })

  it('handles thinking blocks and records them in flowSteps', async () => {
    mockFetch.mockResolvedValueOnce(mockSSEResponse([
      { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'Let me think...' } },
      { type: 'content_block_delta', delta: { text: 'Answer' } },
    ]))

    const ctx = makeCtx()
    const result = await streamAnthropic(
      [{ role: 'user', content: 'think hard' }],
      '', { model: 'test', apiKey: 'k' },
      'req-think', [], null, null, ctx
    )

    expect(result.answer).toBe('Answer')
    expect(result.toolSteps).toEqual([
      { name: '__thinking__', output: 'Let me think...' },
    ])
  })

  it('executes tool calls and loops', async () => {
    mockFetch
      .mockResolvedValueOnce(mockSSEResponse([
        { type: 'content_block_start', content_block: { type: 'tool_use', id: 'tc1', name: 'web_fetch' } },
        { type: 'content_block_delta', delta: { partial_json: '{"url":"https://example.com"}' } },
        { type: 'content_block_stop' },
        { type: 'message_delta', usage: { output_tokens: 20 } },
      ]))
      .mockResolvedValueOnce(mockSSEResponse([
        { type: 'content_block_delta', delta: { text: 'Got it!' } },
      ]))

    const ctx = makeCtx({
      executeTool: vi.fn(async (name, input) => `Content from ${input.url}`),
    })
    const result = await streamAnthropic(
      [{ role: 'user', content: 'fetch example.com' }],
      '', { model: 'test', apiKey: 'k' },
      'req-tool', [{ name: 'web_fetch', description: 'fetch', input_schema: {} }],
      'session-1', null, ctx
    )

    expect(result.answer).toContain('Got it!')
    expect(ctx.executeTool).toHaveBeenCalledWith('web_fetch', { url: 'https://example.com' }, expect.anything(), expect.anything())
    expect(result.toolSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'web_fetch' }),
      ])
    )
  })

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: new Map(),
      text: async () => 'Unauthorized',
    })

    const ctx = makeCtx()
    await expect(
      streamAnthropic(
        [{ role: 'user', content: 'hi' }],
        '', { model: 'test', apiKey: 'bad' },
        'req-err', [], null, null, ctx
      )
    ).rejects.toThrow('Anthropic API 401')
  })

  it('tracks cache read/write stats', async () => {
    mockFetch.mockResolvedValueOnce(mockSSEResponse([
      { type: 'message_start', message: { usage: { input_tokens: 100, cache_read_input_tokens: 80, cache_creation_input_tokens: 20 } } },
      { type: 'content_block_delta', delta: { text: 'cached' } },
      { type: 'message_delta', usage: { output_tokens: 10 } },
    ]))

    const ctx = makeCtx()
    const result = await streamAnthropic(
      [{ role: 'user', content: 'hi' }],
      '', { model: 'test', apiKey: 'k' },
      'req-cache', [], null, null, ctx
    )

    expect(result.usage.cacheRead).toBe(80)
    expect(result.usage.cacheWrite).toBe(20)
  })

  it('sends correct headers and endpoint', async () => {
    mockFetch.mockResolvedValueOnce(mockSSEResponse([
      { type: 'content_block_delta', delta: { text: 'ok' } },
    ]))

    const ctx = makeCtx()
    await streamAnthropic(
      [{ role: 'user', content: 'hi' }],
      '', { model: 'claude-sonnet-4-20250514', apiKey: 'sk-test-123' },
      'req-hdr', [], null, null, ctx
    )

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    const reqOpts = opts
    expect(reqOpts.method).toBe('POST')
    expect(reqOpts.headers['anthropic-version']).toBe('2023-06-01')
  })
})
