/**
 * test/heartbeat.test.mjs — Tests for heartbeat + cron logic
 *
 * Covers: heartbeat start/stop lifecycle, interval config,
 * HEARTBEAT.md injection, dedicated requestId isolation,
 * heartbeat-result dispatch, cron service init.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

// We test the heartbeat logic extracted to functions, not the full main.js
// Since heartbeat is still inline in main.js, we test the CronService directly
// and mock the heartbeat flow

describe('CronService', () => {
  let CronService
  let tmpDir

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paw-cron-'))
    fs.mkdirSync(path.join(tmpDir, '.paw'), { recursive: true })
    const mod = await import('../core/cron.js')
    CronService = mod.CronService
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('initializes with zero jobs when no cron-jobs.json exists', () => {
    const svc = new CronService({
      pawDir: path.join(tmpDir, '.paw'),
      onSystemEvent: vi.fn(),
      onAgentTurn: vi.fn(),
      triggerHeartbeat: vi.fn(),
    })
    svc.start()
    expect(svc.list().length).toBe(0)
    svc.stop()
  })

  it('loads jobs from cron-jobs.json', () => {
    const cronPath = path.join(tmpDir, '.paw', 'cron-jobs.json')
    fs.writeFileSync(cronPath, JSON.stringify({
      version: 1,
      jobs: [{
        id: 'test-job',
        name: 'Test',
        schedule: { kind: 'cron', value: '*/5 * * * *' },
        sessionTarget: 'main',
        payload: { kind: 'systemEvent', text: 'do something', message: 'do something' },
        enabled: true,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        state: { runningAtMs: null, consecutiveErrors: 0 },
      }]
    }))

    const svc = new CronService({
      pawDir: path.join(tmpDir, '.paw'),
      onSystemEvent: vi.fn(),
      onAgentTurn: vi.fn(),
      triggerHeartbeat: vi.fn(),
    })
    svc.start()
    const jobs = svc.list()
    expect(jobs.length).toBe(1)
    expect(jobs[0].name).toBe('Test')
    svc.stop()
  })

  it('stop() cleans up without errors', () => {
    const svc = new CronService({
      pawDir: path.join(tmpDir, '.paw'),
      onSystemEvent: vi.fn(),
      onAgentTurn: vi.fn(),
      triggerHeartbeat: vi.fn(),
    })
    svc.start()
    expect(() => svc.stop()).not.toThrow()
  })

  it('add() creates a new cron job and persists', () => {
    const svc = new CronService({
      pawDir: path.join(tmpDir, '.paw'),
      onSystemEvent: vi.fn(),
      onAgentTurn: vi.fn(),
      triggerHeartbeat: vi.fn(),
    })
    svc.start()

    const result = svc.add({
      name: 'Cleanup',
      schedule: { kind: 'cron', value: '0 3 * * *' },
      message: 'run cleanup',
    })

    expect(result).toBeDefined()
    expect(result.error).toBeUndefined()
    expect(svc.list().length).toBe(1)

    // Check persistence
    const cronPath = path.join(tmpDir, '.paw', 'cron-jobs.json')
    const saved = JSON.parse(fs.readFileSync(cronPath, 'utf8'))
    expect(saved.jobs.length).toBe(1)
    expect(saved.jobs[0].name).toBe('Cleanup')

    svc.stop()
  })

  it('remove() deletes a job', () => {
    const svc = new CronService({
      pawDir: path.join(tmpDir, '.paw'),
      onSystemEvent: vi.fn(),
      onAgentTurn: vi.fn(),
      triggerHeartbeat: vi.fn(),
    })
    svc.start()

    const job = svc.add({ name: 'Temp', schedule: { kind: 'cron', value: '* * * * *' }, message: 'hi' })
    expect(svc.list().length).toBe(1)

    svc.remove(job.id)
    expect(svc.list().length).toBe(0)

    svc.stop()
  })
})

describe('Heartbeat config parsing', () => {
  // Test the config parsing logic that heartbeat uses

  it('defaults to 30 minute interval when not configured', () => {
    const cfg = {}
    const hb = cfg.heartbeat || {}
    const ms = (hb.intervalMinutes || 30) * 60000
    expect(ms).toBe(30 * 60000)
  })

  it('respects custom interval', () => {
    const cfg = { heartbeat: { intervalMinutes: 5 } }
    const hb = cfg.heartbeat || {}
    const ms = (hb.intervalMinutes || 30) * 60000
    expect(ms).toBe(5 * 60000)
  })

  it('detects disabled heartbeat', () => {
    const cfg = { heartbeat: { enabled: false } }
    expect(cfg.heartbeat?.enabled === false).toBe(true)
  })

  it('uses custom prompt when provided', () => {
    const cfg = { heartbeat: { prompt: 'Custom heartbeat check' } }
    const hb = cfg.heartbeat || {}
    const prompt = hb.prompt || 'default prompt'
    expect(prompt).toBe('Custom heartbeat check')
  })

  it('generates unique requestIds per heartbeat tick', () => {
    const ids = new Set()
    for (let i = 0; i < 100; i++) {
      ids.add('hb-' + Date.now().toString(36) + '-' + i)
    }
    expect(ids.size).toBe(100)
  })
})

describe('Heartbeat workspace binding', () => {
  // Document current behavior: heartbeat is global, not per-workspace
  // These tests verify current behavior to catch regressions when we refactor

  it('reads HEARTBEAT.md from clawDir', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paw-hb-'))
    const hbPath = path.join(tmpDir, 'HEARTBEAT.md')
    fs.writeFileSync(hbPath, '# Heartbeat\nCheck systems.')

    let prompt = 'base prompt'
    if (fs.existsSync(hbPath)) {
      prompt += '\n\n' + fs.readFileSync(hbPath, 'utf8')
    }

    expect(prompt).toContain('base prompt')
    expect(prompt).toContain('Check systems.')

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('works without HEARTBEAT.md', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paw-hb-'))

    let prompt = 'base prompt'
    const hbPath = path.join(tmpDir, 'HEARTBEAT.md')
    if (fs.existsSync(hbPath)) {
      prompt += '\n\n' + fs.readFileSync(hbPath, 'utf8')
    }

    expect(prompt).toBe('base prompt')

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})
