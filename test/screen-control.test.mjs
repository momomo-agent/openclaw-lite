// test/screen-control.test.mjs — Screen control tools tests
//
// Uses dependency injection (_setDeps) instead of vi.mock('child_process')
// because Vitest ESM mocks can't intercept CJS require() calls.

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// Mock electron
const mockBrowserWindow = {
  getAllWindows: vi.fn(() => [])
}

vi.mock('electron', () => ({
  BrowserWindow: mockBrowserWindow
}))

const mockExecFile = vi.fn()
const mockExecFileSync = vi.fn(() => '/usr/local/lib/node_modules')
const mockFs = {
  accessSync: vi.fn(),
  readFileSync: vi.fn(() => Buffer.from('fake-png-data')),
  unlinkSync: vi.fn(),
  constants: { X_OK: 1 },
}

let resetDriverCache

beforeAll(async () => {
  // Import and inject test deps BEFORE any handler runs
  const mod = await import('../tools/screen-control')
  mod._setDeps({
    execFile: mockExecFile,
    execFileSync: mockExecFileSync,
    fs: mockFs,
    getElectron: () => ({ BrowserWindow: mockBrowserWindow }),
  })
  resetDriverCache = mod._resetDriverCache
})

function getTool(name) {
  const { getTool: gt } = require('../tools/registry')
  return gt(name)
}

describe('screen_sense', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDriverCache()
    mockFs.accessSync.mockImplementation(() => {})
  })

  it('formats element list with role grouping', async () => {
    const mockElements = [
      { ref: '@e1', role: 'Button', label: 'Submit' },
      { ref: '@e2', role: 'Button', label: 'Cancel' },
      { ref: '@e3', role: 'TextField', label: 'Email', value: 'user@example.com' },
      { ref: '@e4', role: 'Link', label: 'Learn more' },
      { ref: '@e5', role: 'StaticText', label: 'Welcome' },
    ]

    mockExecFile.mockImplementation((path, args, opts, callback) => {
      callback(null, JSON.stringify(mockElements), '')
    })

    const tool = getTool('screen_sense')
    expect(tool).toBeDefined()

    const result = await tool.handler({})

    expect(result).toContain('5 elements')
    expect(result).toContain('2×Button')
    expect(result).toContain('@e1')
    expect(result).toContain('Submit')
  })

  it('handles empty element list', async () => {
    mockExecFile.mockImplementation((path, args, opts, callback) => {
      callback(null, JSON.stringify([]), '')
    })

    const tool = getTool('screen_sense')
    const result = await tool.handler({})

    expect(result).toContain('No interactive elements found')
  })

  it('handles driver errors gracefully', async () => {
    mockExecFile.mockImplementation((path, args, opts, callback) => {
      callback(new Error('Driver not found'), '', 'driver error')
    })

    const tool = getTool('screen_sense')
    const result = await tool.handler({})

    expect(result).toContain('driver error')
  })

  it('passes app target correctly', async () => {
    mockExecFile.mockImplementation((path, args, opts, callback) => {
      expect(args).toContain('--app')
      expect(args).toContain('Chrome')
      callback(null, JSON.stringify([]), '')
    })

    const tool = getTool('screen_sense')
    await tool.handler({ app: 'Chrome' })
  })
})

describe('screen_act', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDriverCache()
    mockFs.accessSync.mockImplementation(() => {})
  })

  it('executes click action', async () => {
    mockExecFile.mockImplementation((path, args, opts, callback) => {
      expect(args).toContain('click')
      expect(args).toContain('@e5')
      callback(null, JSON.stringify({ ok: true }), '')
    })

    const tool = getTool('screen_act')
    const result = await tool.handler({ action: 'click', ref: '@e5' })

    expect(result).toContain('Done')
    expect(result).toContain('click')
  })

  it('executes fill action with text', async () => {
    mockExecFile.mockImplementation((path, args, opts, callback) => {
      expect(args).toContain('fill')
      expect(args).toContain('@e3')
      expect(args).toContain('hello world')
      callback(null, JSON.stringify({ ok: true }), '')
    })

    const tool = getTool('screen_act')
    const result = await tool.handler({
      action: 'fill',
      ref: '@e3',
      text: 'hello world',
    })

    expect(result).toContain('Done')
  })

  it('validates required parameters', async () => {
    const tool = getTool('screen_act')

    const result = await tool.handler({ action: 'click' })
    expect(result).toContain('Error')
    expect(result).toContain('ref required')
  })

  it('executes press action', async () => {
    mockExecFile.mockImplementation((path, args, opts, callback) => {
      expect(args).toContain('press')
      expect(args).toContain('cmd+w')
      callback(null, JSON.stringify({ ok: true, action: 'press' }), '')
    })

    const tool = getTool('screen_act')
    const result = await tool.handler({ action: 'press', key: 'cmd+w' })

    expect(result).toContain('Done')
  })

  it('executes drag action', async () => {
    mockExecFile.mockImplementation((path, args, opts, callback) => {
      expect(args).toContain('drag')
      expect(args).toContain('@e1')
      expect(args).toContain('@e2')
      callback(null, JSON.stringify({ ok: true, action: 'drag' }), '')
    })

    const tool = getTool('screen_act')
    const result = await tool.handler({
      action: 'drag',
      from_ref: '@e1',
      to_ref: '@e2',
    })

    expect(result).toContain('Done')
  })
})

describe('screen_shot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDriverCache()
    mockFs.accessSync.mockImplementation(() => {})
    mockFs.readFileSync.mockReturnValue(Buffer.from('fake-png-data'))
  })

  it('returns image result structure', async () => {
    mockBrowserWindow.getAllWindows.mockReturnValue([{
      getTitle: () => 'Paw',
      isVisible: () => true,
      hide: vi.fn(),
      show: vi.fn(),
    }])

    // screencapture succeeds — call callback immediately (no setTimeout in test)
    mockExecFile.mockImplementation((path, args, callback) => {
      // Simulate async but immediate callback
      setImmediate(() => callback(null, '', ''))
    })

    const tool = getTool('screen_shot')
    const result = await tool.handler({})

    if (result.error) console.log('screen_shot error:', result.error)

    expect(result).toHaveProperty('result')
    expect(result).toHaveProperty('image')
    expect(result.image).toHaveProperty('type', 'base64')
    expect(result.image).toHaveProperty('media_type', 'image/png')
    expect(result.image).toHaveProperty('data')
  })

  it('handles screenshot errors', async () => {
    mockExecFile.mockImplementation((path, args, callback) => {
      if (typeof callback === 'function') {
        callback(new Error('Permission denied'), '', '')
      } else if (typeof args === 'function') {
        args(new Error('Permission denied'), '', '')
      }
    })

    const tool = getTool('screen_shot')
    const result = await tool.handler({})

    expect(result).toHaveProperty('error')
  })
})

describe('Driver discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDriverCache()
  })

  it('checks multiple candidate paths', async () => {
    mockFs.accessSync
      .mockImplementationOnce(() => { throw new Error('not found') })
      .mockImplementationOnce(() => { throw new Error('not found') })
      .mockImplementationOnce(() => {})

    const tool = getTool('screen_sense')
    expect(tool).toBeDefined()
  })
})
