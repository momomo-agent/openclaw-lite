// core/loop-detection.js — Detect repetitive tool call patterns
// OpenClaw-aligned: recordToolCall → detectToolCallLoop → execute → recordToolCallOutcome

const crypto = require('crypto');

const WARNING_THRESHOLD = 10;
const CRITICAL_THRESHOLD = 20;
const GLOBAL_CIRCUIT_BREAKER_THRESHOLD = 30;
const TOOL_CALL_HISTORY_SIZE = 30;
const LOOP_WARNING_BUCKET_SIZE = 10;

// Known polling tools — matches OpenClaw: command_status + process(action=poll/log)
function isKnownPollToolCall(toolName, params) {
  if (toolName === 'command_status') return true;
  if (toolName !== 'process' || !params || typeof params !== 'object') return false;
  return params.action === 'poll' || params.action === 'log';
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function digestStable(value) {
  try {
    const serialized = stableStringify(value);
    return crypto.createHash('sha256').update(serialized).digest('hex');
  } catch {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
  }
}

function hashToolCall(toolName, params) {
  return `${toolName}:${digestStable(params)}`;
}

/**
 * Hash a tool call outcome for no-progress detection.
 * Matches OpenClaw's hashToolOutcome — extracts structured content.
 */
function hashToolOutcome(toolName, params, result, error) {
  if (error !== undefined) {
    const errStr = error instanceof Error ? error.message : String(error);
    return `error:${digestStable(errStr)}`;
  }
  if (result === undefined) return undefined;
  // For string results (Paw returns strings from executeTool), hash directly
  if (typeof result === 'string') return digestStable(result);
  return digestStable(result);
}

/**
 * Get no-progress streak: consecutive calls with same tool + args + result hash.
 * Matches OpenClaw's getNoProgressStreak.
 */
function getNoProgressStreak(history, toolName, argsHash) {
  let streak = 0;
  let latestResultHash;

  for (let i = history.length - 1; i >= 0; i--) {
    const record = history[i];
    if (record.toolName !== toolName || record.argsHash !== argsHash) continue;
    if (typeof record.resultHash !== 'string' || !record.resultHash) continue;
    if (!latestResultHash) {
      latestResultHash = record.resultHash;
      streak = 1;
      continue;
    }
    if (record.resultHash !== latestResultHash) break;
    streak++;
  }

  return { count: streak, latestResultHash };
}

/**
 * Get ping-pong alternation streak.
 * Matches OpenClaw's getPingPongStreak — requires noProgressEvidence for critical block.
 */
function getPingPongStreak(history, currentArgsHash) {
  const last = history[history.length - 1];
  if (!last) return { count: 0, noProgressEvidence: false };

  let otherArgsHash, otherToolName;
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i].argsHash !== last.argsHash) {
      otherArgsHash = history[i].argsHash;
      otherToolName = history[i].toolName;
      break;
    }
  }
  if (!otherArgsHash) return { count: 0, noProgressEvidence: false };

  let alternatingCount = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const expected = alternatingCount % 2 === 0 ? last.argsHash : otherArgsHash;
    if (history[i].argsHash !== expected) break;
    alternatingCount++;
  }

  if (alternatingCount < 2) return { count: 0, noProgressEvidence: false };
  if (currentArgsHash !== otherArgsHash) return { count: 0, noProgressEvidence: false };

  // Check no-progress evidence: both sides produce identical outputs
  const tailStart = Math.max(0, history.length - alternatingCount);
  let firstHashA, firstHashB;
  let noProgressEvidence = true;
  for (let i = tailStart; i < history.length; i++) {
    const call = history[i];
    if (!call.resultHash) { noProgressEvidence = false; break; }
    if (call.argsHash === last.argsHash) {
      if (!firstHashA) firstHashA = call.resultHash;
      else if (firstHashA !== call.resultHash) { noProgressEvidence = false; break; }
    } else if (call.argsHash === otherArgsHash) {
      if (!firstHashB) firstHashB = call.resultHash;
      else if (firstHashB !== call.resultHash) { noProgressEvidence = false; break; }
    } else {
      noProgressEvidence = false; break;
    }
  }
  if (!firstHashA || !firstHashB) noProgressEvidence = false;

  return {
    count: alternatingCount + 1,
    pairedToolName: last.toolName,
    pairedArgsHash: last.argsHash,
    noProgressEvidence,
  };
}

class LoopDetector {
  constructor(opts = {}) {
    this.enabled = opts.enabled !== false; // default true for Paw (no SDK-level safeguards)
    this.warningThreshold = opts.warningThreshold || WARNING_THRESHOLD;
    this.criticalThreshold = opts.criticalThreshold || CRITICAL_THRESHOLD;
    this.circuitBreakerThreshold = opts.circuitBreakerThreshold || GLOBAL_CIRCUIT_BREAKER_THRESHOLD;
    this.historySize = opts.historySize || TOOL_CALL_HISTORY_SIZE;
    // Enforce threshold ordering (OpenClaw-aligned)
    if (this.criticalThreshold <= this.warningThreshold) this.criticalThreshold = this.warningThreshold + 1;
    if (this.circuitBreakerThreshold <= this.criticalThreshold) this.circuitBreakerThreshold = this.criticalThreshold + 1;
    this.history = [];  // { toolName, argsHash, resultHash?, timestamp }
    this.warningBuckets = new Map(); // warningKey → lastBucket (for dedup)
  }

  /**
   * Record a tool call in history (before execution).
   * Matches OpenClaw's recordToolCall.
   */
  recordToolCall(toolName, params) {
    const argsHash = hashToolCall(toolName, params);
    this.history.push({ toolName, argsHash, timestamp: Date.now() });
    if (this.history.length > this.historySize) this.history.shift();
  }

  /**
   * Record a tool call outcome (after execution).
   * Matches OpenClaw's recordToolCallOutcome — enables no-progress detection.
   */
  recordOutcome(toolName, params, result, error) {
    const argsHash = hashToolCall(toolName, params);
    const resultHash = hashToolOutcome(toolName, params, result, error);
    if (!resultHash) return;

    // Find the most recent matching entry without a resultHash and attach it
    for (let i = this.history.length - 1; i >= 0; i--) {
      const call = this.history[i];
      if (call.toolName === toolName && call.argsHash === argsHash && call.resultHash === undefined) {
        call.resultHash = resultHash;
        return;
      }
    }
    // Fallback: append new entry with result
    this.history.push({ toolName, argsHash, resultHash, timestamp: Date.now() });
    if (this.history.length > this.historySize) this.history.shift();
  }

  /**
   * Detect if agent is stuck in a repetitive tool call loop.
   * Call AFTER recordToolCall, BEFORE execution.
   * Matches OpenClaw's detectToolCallLoop.
   * @returns {{ blocked: boolean, warning: boolean, reason?: string }}
   */
  check(toolName, params) {
    if (!this.enabled) return { blocked: false, warning: false };

    const currentHash = hashToolCall(toolName, params);
    const noProgress = getNoProgressStreak(this.history, toolName, currentHash);
    const knownPoll = isKnownPollToolCall(toolName, params);
    const pingPong = getPingPongStreak(this.history, currentHash);

    // 1. Global circuit breaker: no-progress streak >= threshold (OpenClaw-aligned)
    if (noProgress.count >= this.circuitBreakerThreshold) {
      const warningKey = `global:${toolName}:${currentHash}`;
      return {
        blocked: true, warning: false,
        reason: `CRITICAL: ${toolName} has repeated identical no-progress outcomes ${noProgress.count} times. Session execution blocked by global circuit breaker.`,
        warningKey,
      };
    }

    // 2. Known poll no-progress: polling tool stuck (OpenClaw-aligned)
    if (knownPoll) {
      if (noProgress.count >= this.criticalThreshold) {
        return {
          blocked: true, warning: false,
          reason: `CRITICAL: Called ${toolName} with identical arguments and no progress ${noProgress.count} times. Stuck polling loop blocked.`,
          warningKey: `poll:${toolName}:${currentHash}`,
        };
      }
      if (noProgress.count >= this.warningThreshold) {
        const wk = `poll:${toolName}:${currentHash}`;
        if (this._shouldEmitWarning(wk, noProgress.count)) {
          return {
            blocked: false, warning: true,
            reason: `WARNING: ${toolName} called ${noProgress.count} times with identical arguments and no progress. Stop polling or increase wait time.`,
            warningKey: wk,
          };
        }
      }
    }

    // 3. Ping-pong: A-B-A-B alternation (OpenClaw-aligned — requires noProgressEvidence for block)
    if (pingPong.count >= this.criticalThreshold && pingPong.noProgressEvidence) {
      return {
        blocked: true, warning: false,
        reason: `CRITICAL: Alternating tool-call patterns (${pingPong.count} calls) with no progress. Ping-pong loop blocked.`,
        warningKey: `pingpong:${currentHash}`,
      };
    }
    if (pingPong.count >= this.warningThreshold) {
      const wk = `pingpong:${currentHash}`;
      if (this._shouldEmitWarning(wk, pingPong.count)) {
        return {
          blocked: false, warning: true,
          reason: `WARNING: Alternating tool-call patterns (${pingPong.count} calls). This looks like a ping-pong loop.`,
          warningKey: wk,
        };
      }
    }

    // 4. Generic repeat: warn-only (OpenClaw-aligned — genericRepeat NEVER blocks)
    if (!knownPoll) {
      const recentCount = this.history.filter(h => h.toolName === toolName && h.argsHash === currentHash).length;
      if (recentCount >= this.warningThreshold) {
        const wk = `generic:${toolName}:${currentHash}`;
        if (this._shouldEmitWarning(wk, recentCount)) {
          return {
            blocked: false, warning: true,
            reason: `WARNING: ${toolName} called ${recentCount} times with identical arguments. If not making progress, stop retrying.`,
            warningKey: wk,
          };
        }
      }
    }

    return { blocked: false, warning: false };
  }

  /**
   * Warning deduplication — only emit once per bucket (OpenClaw-aligned).
   */
  _shouldEmitWarning(warningKey, count) {
    const bucket = Math.floor(count / LOOP_WARNING_BUCKET_SIZE);
    const lastBucket = this.warningBuckets.get(warningKey) || 0;
    if (bucket <= lastBucket) return false;
    this.warningBuckets.set(warningKey, bucket);
    if (this.warningBuckets.size > 256) {
      const oldest = this.warningBuckets.keys().next().value;
      if (oldest) this.warningBuckets.delete(oldest);
    }
    return true;
  }

  reset() {
    this.history = [];
    this.warningBuckets.clear();
  }
}

module.exports = { LoopDetector };
