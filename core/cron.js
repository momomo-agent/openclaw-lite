// core/cron.js — CronService (OpenClaw-aligned)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Cron } = require('croner');

// Timer constants (OpenClaw-aligned)
const MAX_TIMER_DELAY_MS = 60_000;
const MIN_REFIRE_GAP_MS = 2_000;
const STUCK_RUN_MS = 2 * 60 * 60 * 1000;  // 2 hours
const MAX_CATCHUP_JOBS = 5;
const BACKOFF_SCHEDULE = [30_000, 60_000, 300_000, 900_000, 3_600_000];
const STORE_VERSION = 1;

function errorBackoffMs(consecutiveErrors) {
  if (consecutiveErrors <= 0) return 0;
  const idx = Math.min(consecutiveErrors - 1, BACKOFF_SCHEDULE.length - 1);
  return BACKOFF_SCHEDULE[idx];
}

function uuid() {
  return crypto.randomUUID();
}

function nowMs() {
  return Date.now();
}

/**
 * Parse absolute time (OpenClaw-aligned parseAbsoluteTimeMs)
 * Supports: epoch ms (number), ISO date only (YYYY-MM-DD), ISO datetime
 */
function parseAbsoluteTimeMs(input) {
  if (typeof input === 'number') return input;
  if (typeof input !== 'string') return null;

  // Epoch ms as string
  if (/^\d{10,}$/.test(input)) return parseInt(input, 10);

  // ISO date only: 2024-01-15 → 2024-01-15T00:00:00Z
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const d = new Date(input + 'T00:00:00Z');
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  // ISO datetime: add Z if no timezone
  let s = input;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/[Zz+\-]\d{2}:?\d{2}$/.test(s) && !s.endsWith('Z')) {
    s += 'Z';
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * Compute next run time for a schedule
 */
function computeNextRun(schedule) {
  const now = nowMs();

  switch (schedule.kind) {
    case 'at': {
      const targetMs = parseAbsoluteTimeMs(schedule.at);
      if (!targetMs) return null;
      return targetMs > now ? targetMs : null;  // Already past
    }

    case 'every': {
      const everyMs = schedule.everyMs;
      if (!everyMs || everyMs <= 0) return null;
      const anchor = schedule.anchorMs || now;
      if (now < anchor) return anchor;
      const elapsed = now - anchor;
      const periods = Math.ceil(elapsed / everyMs);
      return anchor + periods * everyMs;
    }

    case 'cron': {
      const tz = schedule.tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
      try {
        const job = new Cron(schedule.expr, { timezone: tz });
        const next = job.nextRun();
        return next ? next.getTime() : null;
      } catch (e) {
        console.warn(`[Cron] Invalid cron expression: ${schedule.expr}`, e.message);
        return null;
      }
    }

    default:
      return null;
  }
}

class CronService {
  /**
   * @param {Object} opts
   * @param {string} opts.pawDir - .paw directory path
   * @param {Function} opts.onSystemEvent - (text) => Promise<void> — inject system event into main session
   * @param {Function} opts.onAgentTurn - (payload) => Promise<{status, error?, durationMs?}> — run isolated agent turn
   * @param {Function} opts.triggerHeartbeat - () => void — trigger heartbeat immediately
   */
  constructor(opts) {
    this._pawDir = opts.pawDir;
    this._onSystemEvent = opts.onSystemEvent;
    this._onAgentTurn = opts.onAgentTurn;
    this._triggerHeartbeat = opts.triggerHeartbeat;
    this._storePath = path.join(opts.pawDir, 'cron-jobs.json');
    this._timer = null;
    this._running = false;
    this._jobs = [];
  }

  // ── Storage ──

  _loadStore() {
    try {
      const data = JSON.parse(fs.readFileSync(this._storePath, 'utf8'));
      if (data.version === STORE_VERSION && Array.isArray(data.jobs)) {
        this._jobs = data.jobs;
      } else {
        this._jobs = [];
      }
    } catch {
      this._jobs = [];
    }
  }

  _saveStore() {
    const data = JSON.stringify({ version: STORE_VERSION, jobs: this._jobs }, null, 2);
    const tmpPath = this._storePath + '.tmp';
    fs.writeFileSync(tmpPath, data, { mode: 0o600 });
    fs.renameSync(tmpPath, this._storePath);
  }

  // ── Lifecycle ──

  start() {
    this._loadStore();

    // Clear stale running markers (OpenClaw-aligned: ops.start)
    for (const job of this._jobs) {
      if (job.state.runningAtMs) {
        console.log(`[Cron] Clearing stale run: ${job.name}`);
        job.state.runningAtMs = null;
      }
    }

    // Recompute nextRunAtMs for all enabled jobs
    for (const job of this._jobs) {
      if (job.enabled) {
        job.state.nextRunAtMs = computeNextRun(job.schedule);
      }
    }

    // Catch-up missed jobs (max 5)
    const now = nowMs();
    const missed = this._jobs
      .filter(j => j.enabled && j.state.nextRunAtMs && j.state.nextRunAtMs <= now)
      .sort((a, b) => a.state.nextRunAtMs - b.state.nextRunAtMs)
      .slice(0, MAX_CATCHUP_JOBS);

    if (missed.length > 0) {
      console.log(`[Cron] Catching up ${missed.length} missed jobs`);
      // Run them async — don't block start
      this._runMissedJobs(missed);
    }

    this._saveStore();
    this._armTimer();
    console.log(`[Cron] Started with ${this._jobs.length} jobs`);
  }

  async _runMissedJobs(jobs) {
    for (const job of jobs) {
      await this._executeJob(job, 'catchup');
    }
    this._saveStore();
    this._armTimer();
  }

  stop() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    console.log('[Cron] Stopped');
  }

  // ── Timer (OpenClaw-aligned) ──

  _armTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    const enabledJobs = this._jobs.filter(j => j.enabled && j.state.nextRunAtMs);
    if (enabledJobs.length === 0) return;

    const nearest = Math.min(...enabledJobs.map(j => j.state.nextRunAtMs));
    const now = nowMs();
    let delay = Math.max(nearest - now, 0);
    if (delay === 0) delay = MIN_REFIRE_GAP_MS;
    delay = Math.min(delay, MAX_TIMER_DELAY_MS);

    this._timer = setTimeout(() => this._onTimer(), delay);
  }

  async _onTimer() {
    if (this._running) {
      // Recheck later
      this._timer = setTimeout(() => this._onTimer(), MIN_REFIRE_GAP_MS);
      return;
    }

    this._running = true;
    try {
      // Force-reload store (detect external edits)
      this._loadStore();

      const now = nowMs();

      // Clean up stuck runs (OpenClaw-aligned: 2h threshold)
      for (const job of this._jobs) {
        if (job.state.runningAtMs && (now - job.state.runningAtMs) > STUCK_RUN_MS) {
          console.warn(`[Cron] Stuck run cleared: ${job.name}`);
          job.state.runningAtMs = null;
          job.state.lastRunStatus = 'stuck';
          job.state.consecutiveErrors++;
        }
      }

      // Collect runnable jobs
      const runnable = this._jobs.filter(j =>
        j.enabled &&
        !j.state.runningAtMs &&
        j.state.nextRunAtMs &&
        j.state.nextRunAtMs <= now
      );

      // Execute sequentially
      for (const job of runnable) {
        await this._executeJob(job, 'scheduled');
      }

      // Recompute nextRunAtMs + persist
      for (const job of this._jobs) {
        if (job.enabled && !job.state.runningAtMs) {
          const nextRun = computeNextRun(job.schedule);
          if (nextRun) {
            // Apply error backoff
            if (job.state.consecutiveErrors > 0 && job.state.lastRunAtMs) {
              const backoff = errorBackoffMs(job.state.consecutiveErrors);
              job.state.nextRunAtMs = Math.max(nextRun, job.state.lastRunAtMs + backoff);
            } else {
              job.state.nextRunAtMs = nextRun;
            }
          } else {
            job.state.nextRunAtMs = null;
          }
        }
      }

      // Handle deleteAfterRun
      this._jobs = this._jobs.filter(j => {
        if (j.deleteAfterRun && j.state.lastRunAtMs) {
          console.log(`[Cron] Auto-deleted job: ${j.name}`);
          return false;
        }
        return true;
      });

      this._saveStore();
    } catch (e) {
      console.error('[Cron] Timer error:', e);
    } finally {
      this._running = false;
      this._armTimer();
    }
  }

  async _executeJob(job, trigger) {
    console.log(`[Cron] Executing: ${job.name} (${trigger})`);
    const startMs = nowMs();
    job.state.runningAtMs = startMs;

    let status = 'ok';
    let error = null;

    try {
      if (job.sessionTarget === 'main' && job.payload.kind === 'systemEvent') {
        if (job.wakeMode === 'now') {
          await this._onSystemEvent(job.payload.text);
          if (this._triggerHeartbeat) this._triggerHeartbeat();
        } else {
          // next-heartbeat: just inject the event text, let heartbeat pick it up
          await this._onSystemEvent(job.payload.text);
        }
      } else if (job.sessionTarget === 'isolated' && job.payload.kind === 'agentTurn') {
        const result = await this._onAgentTurn(job.payload);
        if (result?.error) {
          status = 'error';
          error = result.error;
        }
      } else {
        status = 'error';
        error = `Invalid sessionTarget/payload combination: ${job.sessionTarget}/${job.payload.kind}`;
      }
    } catch (e) {
      status = 'error';
      error = e.message;
    }

    const endMs = nowMs();
    job.state.runningAtMs = null;
    job.state.lastRunAtMs = endMs;
    job.state.lastRunStatus = status;
    job.state.lastError = error;
    job.state.lastDurationMs = endMs - startMs;

    if (status === 'error') {
      job.state.consecutiveErrors++;
    } else {
      job.state.consecutiveErrors = 0;
    }

    this._saveStore();
  }

  // ── CRUD API ──

  list(opts = {}) {
    if (opts.includeDisabled) return [...this._jobs];
    return this._jobs.filter(j => j.enabled);
  }

  getJob(id) {
    return this._jobs.find(j => j.id === id) || null;
  }

  add(input) {
    // Validate
    if (!input.name) return { error: 'name is required' };
    if (!input.schedule) return { error: 'schedule is required' };

    const schedule = input.schedule;
    if (!['at', 'every', 'cron'].includes(schedule.kind)) {
      return { error: 'schedule.kind must be at, every, or cron' };
    }

    // Validate sessionTarget + payload
    const sessionTarget = input.sessionTarget || 'main';
    const payloadKind = input.payload?.kind || (sessionTarget === 'main' ? 'systemEvent' : 'agentTurn');

    if (sessionTarget === 'main' && payloadKind !== 'systemEvent') {
      return { error: 'main sessionTarget requires systemEvent payload' };
    }
    if (sessionTarget === 'isolated' && payloadKind !== 'agentTurn') {
      return { error: 'isolated sessionTarget requires agentTurn payload' };
    }

    const job = {
      id: uuid(),
      name: input.name,
      description: input.description || '',
      enabled: input.enabled !== false,
      deleteAfterRun: input.deleteAfterRun ?? (schedule.kind === 'at'),
      createdAtMs: nowMs(),
      updatedAtMs: nowMs(),
      schedule,
      sessionTarget,
      wakeMode: input.wakeMode || 'now',
      payload: {
        kind: payloadKind,
        text: input.payload?.text || input.text || '',
        message: input.payload?.message || input.message || '',
      },
      state: {
        nextRunAtMs: null,
        runningAtMs: null,
        lastRunAtMs: null,
        lastRunStatus: null,
        lastError: null,
        lastDurationMs: null,
        consecutiveErrors: 0,
      }
    };

    job.state.nextRunAtMs = computeNextRun(job.schedule);

    this._jobs.push(job);
    this._saveStore();
    this._armTimer();

    return { id: job.id, name: job.name, nextRunAtMs: job.state.nextRunAtMs };
  }

  update(id, patch) {
    const job = this._jobs.find(j => j.id === id);
    if (!job) return { error: 'Job not found' };

    if (patch.name !== undefined) job.name = patch.name;
    if (patch.description !== undefined) job.description = patch.description;
    if (patch.enabled !== undefined) job.enabled = patch.enabled;
    if (patch.schedule !== undefined) job.schedule = patch.schedule;
    if (patch.wakeMode !== undefined) job.wakeMode = patch.wakeMode;
    if (patch.deleteAfterRun !== undefined) job.deleteAfterRun = patch.deleteAfterRun;
    if (patch.payload !== undefined) job.payload = patch.payload;

    job.updatedAtMs = nowMs();
    job.state.nextRunAtMs = computeNextRun(job.schedule);

    this._saveStore();
    this._armTimer();

    return { id: job.id, name: job.name, nextRunAtMs: job.state.nextRunAtMs };
  }

  remove(id) {
    const idx = this._jobs.findIndex(j => j.id === id);
    if (idx === -1) return { error: 'Job not found' };
    const removed = this._jobs.splice(idx, 1)[0];
    this._saveStore();
    this._armTimer();
    return { id: removed.id, name: removed.name };
  }

  async run(id, mode = 'due') {
    const job = this._jobs.find(j => j.id === id);
    if (!job) return { error: 'Job not found' };

    if (mode === 'due' && (!job.state.nextRunAtMs || job.state.nextRunAtMs > nowMs())) {
      return { error: 'Job is not due yet. Use mode=force to override.' };
    }

    await this._executeJob(job, mode === 'force' ? 'manual-force' : 'manual-due');
    return { id: job.id, status: job.state.lastRunStatus, durationMs: job.state.lastDurationMs };
  }

  wake(text) {
    if (this._onSystemEvent) {
      this._onSystemEvent(text);
    }
    if (this._triggerHeartbeat) {
      this._triggerHeartbeat();
    }
    return { ok: true };
  }

  status() {
    const enabled = this._jobs.filter(j => j.enabled);
    const nextDue = enabled
      .filter(j => j.state.nextRunAtMs)
      .sort((a, b) => a.state.nextRunAtMs - b.state.nextRunAtMs)[0];

    return {
      running: this._timer !== null,
      totalJobs: this._jobs.length,
      enabledJobs: enabled.length,
      nextDueJob: nextDue ? { id: nextDue.id, name: nextDue.name, nextRunAtMs: nextDue.state.nextRunAtMs } : null,
    };
  }
}

module.exports = { CronService, computeNextRun, parseAbsoluteTimeMs };
