/**
 * test/stream-openai.test.mjs — Tests for core/stream-openai.js
 *
 * Tests the OpenAI SSE streaming engine extracted in M39.
 * Mocks global fetch since CJS require() can't be intercepted from ESM tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../core/event-bus', () => ({
  default: { dispatch: vi.fn(), on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  __esModule: false,
}))

const originalFetch = globalThis.fetch

function mockSSEResponse(events) {
  const lines = events.map(e => `data: ${JSON.stringify(e)}`).join('\n') + '\ndata: [DONE]\n'
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

const { streamOpenAI } = await import('../core/stream-openai.js')

describe('streamOpenAI', () => {
  let mockFetch

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns text from a simple text-only response', async () => {
    mockFetch.mockResolvedValueOnce(mockSSEResponse([
      { choices: [{ delta: { content: 'Hello ' } }] },
      { choices: [{ delta: { content: 'world' } }] },
      { choices: [{ delta: {} }], usage: { prompt_tokens: 50, completion_tokens: 10 } },
    ]))

    const ctx = makeCtx()
    const result = await streamOpenAI(
      [{ role: 'user', content: 'hi' }],
      'You are helpful',
      { model: 'gpt-4o', apiKey: 'sk-test' },
      'req-1', [], null, null, ctx
    )

    expect(result.answer).toBe('Hello world')
    expect(result.usage.inputTokens).toBe(50)
    expect(result.usage.outputTokens).toBe(10)
    expect(ctx.pushStatus).toHaveBeenCalledWith('thinking', 'Thinking...')
    expect(ctx.pushStatus).toHaveBeenCalledWith('done', 'Done')
  })

  it('sets _activeRequestId and _activeAbortController on ctx', async () => {
    mockFetch.mockResolvedValueOnce(mockSSEResponse([
      { choices: [{ delta: { content: 'ok' } }] },
    ]))

    const ctx = makeCtx()
    await streamOpenAI(
      [{ role: 'user', content: 'test' }],
      '', { model: 'test', apiKey: 'k' },
      'req-42', [], null, null, ctx
    )

    expect(ctx._activeRequestId).toBe('req-42')
    expect(ctx._activeAbortController).toBeInstanceOf(AbortController)
  })

  it('converts tools to OpenAI function calling format', async () => {
    mockFetch.mockResolvedValueOnce(mockSSEResponse([
      { choices: [{ delta: { content: 'hi' } }] },
    ]))

    const tools = [
      { name: 'web_fetch', description: 'Fetch a URL', input_schema: { type: 'object', properties: { url: { type: 'string' } } } },
    ]
    const ctx = makeCtx()
    await streamOpenAI(
      [{ role: 'user', content: 'hi' }],
      '', { model: 'gpt-4o', apiKey: 'k' },
      'req-tools', tools, null, null, ctx
    )

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(callBody.tools[0]).toEqual({
      type: 'function',
      function: {
        name: 'web_fetch',
        description: 'Fetch a URL',
        parameters: { type: 'object', properties: { url: { type: 'string' } } },
      },
    })
  })

  it('executes tool calls and loops', async () => {
    mockFetch
      .mockResolvedValueOnce(mockSSEResponse([
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'web_fetch', arguments: '' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"url":"https://example.com"}' } }] } }] },
        { choices: [{ delta: {} }], usage: { prompt_tokens: 30, completion_tokens: 15 } },
      ]))
      .mockResolvedValueOnce(mockSSEResponse([
        { choices: [{ delta: { content: 'Got it!' } }] },
      ]))

    const ctx = makeCtx({
      executeTool: vi.fn(async (name, input) => `Content from ${input.url}`),
    })
    const result = await streamOpenAI(
      [{ role: 'user', content: 'fetch example.com' }],
      '', { model: 'gpt-4o', apiKey: 'k' },
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
      streamOpenAI(
        [{ role: 'user', content: 'hi' }],
        '', { model: 'test', apiKey: 'bad' },
        'req-err', [], null, null, ctx
      )
    ).rejects.toThrow('OpenAI API 401')
  })

  it('accumulates usage across multiple rounds', async () => {
    mockFetch
      .mockResolvedValueOnce(mockSSEResponse([
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'web_fetch', arguments: '{"url":"a"}' } }] } }] },
        { choices: [{ delta: {} }], usage: { prompt_tokens: 100, completion_tokens: 20 } },
      ]))
      .mockResolvedValueOnce(mockSSEResponse([
        { choices: [{ delta: { content: 'done' } }] },
        { choices: [{ delta: {} }], usage: { prompt_tokens: 150, completion_tokens: 30 } },
      ]))

    const ctx = makeCtx()
    const result = await streamOpenAI(
      [{ role: 'user', content: 'hi' }],
      '', { model: 'test', apiKey: 'k' },
      'req-usage', [{ name: 'web_fetch', description: 'f', input_schema: {} }],
      null, null, ctx
    )

    expect(result.usage.inputTokens).toBe(250)
    expect(result.usage.outputTokens).toBe(50)
  })

  it('builds correct endpoint from baseUrl', async () => {
    mockFetch.mockResolvedValueOnce(mockSSEResponse([
      { choices: [{ delta: { content: 'ok' } }] },
    ]))
    const ctx = makeCtx()
    await streamOpenAI(
      [{ role: 'user', content: 'hi' }],
      '', { model: 'test', apiKey: 'k', baseUrl: 'https://custom.api.com/v1' },
      'req-url', [], null, null, ctx
    )
    expect(mockFetch.mock.calls[0][0]).toBe('https://custom.api.com/v1/chat/completions')

    mockFetch.mockResolvedValueOnce(mockSSEResponse([
      { choices: [{ delta: { content: 'ok' } }] },
    ]))
    await streamOpenAI(
      [{ role: 'user', content: 'hi' }],
      '', { model: 'test', apiKey: 'k', baseUrl: 'https://custom.api.com' },
      'req-url2', [], null, null, ctx
    )
    expect(mockFetch.mock.calls[1][0]).toBe('https://custom.api.com/v1/chat/completions')
  })

  it('prepends system message when systemPrompt is provided', async () => {
    mockFetch.mockResolvedValueOnce(mockSSEResponse([
      { choices: [{ delta: { content: 'ok' } }] },
    ]))

    const ctx = makeCtx()
    await streamOpenAI(
      [{ role: 'user', content: 'hi' }],
      'Be helpful and concise',
      { model: 'test', apiKey: 'k' },
      'req-sys', [], null, null, ctx
    )

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(callBody.messages[0]).toEqual({ role: 'system', content: 'Be helpful and concise' })
    expect(callBody.messages[1]).toEqual({ role: 'user', content: 'hi' })
  })
})
