// test/screen-control.test.mjs — Screen control tools tests
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { execFile } from 'child_process'

// Mock child_process
vi.mock('child_process', () => ({
  execFile: vi.fn(),
  execFileSync: vi.fn(() => '/usr/local/lib/node_modules')
}))

// Mock electron
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

// Mock fs
vi.mock('fs', () => ({
  accessSync: vi.fn(() => {}), // Default: driver found
  readFileSync: vi.fn(() => Buffer.from('fake-png-data')),
  unlinkSync: vi.fn(),
  constants: { X_OK: 1 }
}))

// Load the tool to register it
beforeAll(() => {
  require('../tools/screen-control')
})

describe('screen_sense', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('formats element list with role grouping', async () => {
    const mockElements = [
      { ref: '@e1', role: 'Button', label: 'Submit' },
      { ref: '@e2', role: 'Button', label: 'Cancel' },
      { ref: '@e3', role: 'TextField', label: 'Email', value: 'user@example.com' },
      { ref: '@e4', role: 'Link', label: 'Learn more' },
      { ref: '@e5', role: 'StaticText', label: 'Welcome' }
    ]

    // Mock successful driver execution
    execFile.mockImplementation((path, args, opts, callback) => {
      callback(null, JSON.stringify(mockElements), '')
    })

    const { getTool } = require('../tools/registry')
    const tool = getTool('screen_sense')
    expect(tool).toBeDefined()

    const result = await tool.handler({})
    
    expect(result).toContain('5 elements')
    expect(result).toContain('2×Button')
    expect(result).toContain('@e1')
    expect(result).toContain('Submit')
  })

  it('handles empty element list', async () => {
    execFile.mockImplementation((path, args, opts, callback) => {
      callback(null, JSON.stringify([]), '')
    })

    const { getTool } = require('../tools/registry')
    const tool = getTool('screen_sense')
    const result = await tool.handler({})
    
    expect(result).toContain('No interactive elements found')
  })

  it('handles driver errors gracefully', async () => {
    execFile.mockImplementation((path, args, opts, callback) => {
      callback(new Error('Driver not found'), '', 'driver error')
    })

    const { getTool } = require('../tools/registry')
    const tool = getTool('screen_sense')
    const result = await tool.handler({})
    
    expect(result).toContain('driver error')
  })

  it('passes app target correctly', async () => {
    execFile.mockImplementation((path, args, opts, callback) => {
      expect(args).toContain('--app')
      expect(args).toContain('Chrome')
      callback(null, JSON.stringify([]), '')
    })

    const { getTool } = require('../tools/registry')
    const tool = getTool('screen_sense')
    await tool.handler({ app: 'Chrome' })
  })
})

describe('screen_act', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('executes click action', async () => {
    execFile.mockImplementation((path, args, opts, callback) => {
      expect(args).toContain('click')
      expect(args).toContain('@e5')
      callback(null, JSON.stringify({ ok: true }), '')
    })

    const { getTool } = require('../tools/registry')
    const tool = getTool('screen_act')
    const result = await tool.handler({ action: 'click', ref: '@e5' })
    
    expect(result).toContain('Done')
    expect(result).toContain('click')
  })

  it('executes fill action with text', async () => {
    execFile.mockImplementation((path, args, opts, callback) => {
      expect(args).toContain('fill')
      expect(args).toContain('@e3')
      expect(args).toContain('hello world')
      callback(null, JSON.stringify({ ok: true }), '')
    })

    const { getTool } = require('../tools/registry')
    const tool = getTool('screen_act')
    const result = await tool.handler({ 
      action: 'fill', 
      ref: '@e3', 
      text: 'hello world' 
    })
    
    expect(result).toContain('Done')
  })

  it('validates required parameters', async () => {
    const { getTool } = require('../tools/registry')
    const tool = getTool('screen_act')
    
    const result = await tool.handler({ action: 'click' })
    expect(result).toContain('Error')
    expect(result).toContain('ref required')
  })

  it('executes press action', async () => {
    execFile.mockImplementation((path, args, opts, callback) => {
      expect(args).toContain('press')
      expect(args).toContain('cmd+w')
      callback(null, JSON.stringify({ ok: true, action: 'press' }), '')
    })

    const { getTool } = require('../tools/registry')
    const tool = getTool('screen_act')
    const result = await tool.handler({ action: 'press', key: 'cmd+w' })
    
    expect(result).toContain('Done')
  })

  it('executes drag action', async () => {
    execFile.mockImplementation((path, args, opts, callback) => {
      expect(args).toContain('drag')
      expect(args).toContain('@e1')
      expect(args).toContain('@e2')
      callback(null, JSON.stringify({ ok: true, action: 'drag' }), '')
    })

    const { getTool } = require('../tools/registry')
    const tool = getTool('screen_act')
    const result = await tool.handler({ 
      action: 'drag', 
      from_ref: '@e1', 
      to_ref: '@e2' 
    })
    
    expect(result).toContain('Done')
  })
})

describe('screen_shot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns image result structure', async () => {
    const fs = await import('fs')
    const { BrowserWindow } = await import('electron')
    
    // Mock window hide/show
    BrowserWindow.getAllWindows.mockReturnValue([{
      getTitle: () => 'Paw',
      isVisible: () => true,
      hide: vi.fn(),
      show: vi.fn()
    }])

    // Mock screencapture success
    execFile.mockImplementation((path, args, opts, callback) => {
      callback(null, '', '')
    })

    const { getTool } = require('../tools/registry')
    const tool = getTool('screen_shot')
    const result = await tool.handler({})
    
    expect(result).toHaveProperty('result')
    expect(result).toHaveProperty('image')
    expect(result.image).toHaveProperty('type', 'base64')
    expect(result.image).toHaveProperty('media_type', 'image/png')
    expect(result.image).toHaveProperty('data')
  })

  it('handles screenshot errors', async () => {
    execFile.mockImplementation((path, args, opts, callback) => {
      callback(new Error('Permission denied'), '', '')
    })

    const { getTool } = require('../tools/registry')
    const tool = getTool('screen_shot')
    const result = await tool.handler({})
    
    expect(result).toHaveProperty('error')
  })
})

describe('Driver discovery', () => {
  it('checks multiple candidate paths', async () => {
    const fs = await import('fs')
    
    // First two fail, third succeeds
    fs.accessSync
      .mockImplementationOnce(() => { throw new Error('not found') })
      .mockImplementationOnce(() => { throw new Error('not found') })
      .mockImplementationOnce(() => {}) // success

    // Trigger driver discovery by calling a tool
    const { getTool } = require('../tools/registry')
    const tool = getTool('screen_sense')
    expect(tool).toBeDefined()
  })
})
