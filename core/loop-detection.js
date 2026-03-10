// core/loop-detection.js — Detect repetitive tool call patterns
// OpenClaw-aligned: warning → critical → circuit-breaker + knownPollNoProgress

const DEFAULT_WARNING_THRESHOLD = 3;
const DEFAULT_CRITICAL_THRESHOLD = 5;
const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 8;
const DEFAULT_HISTORY = 30;

// Known polling tools that often get stuck
const POLL_TOOLS = new Set(['process', 'shell_exec']);

class LoopDetector {
  constructor(opts = {}) {
    this.warningThreshold = opts.warningThreshold || DEFAULT_WARNING_THRESHOLD;
    this.criticalThreshold = opts.criticalThreshold || DEFAULT_CRITICAL_THRESHOLD;
    this.circuitBreakerThreshold = opts.circuitBreakerThreshold || DEFAULT_CIRCUIT_BREAKER_THRESHOLD;
    this.historySize = opts.historySize || DEFAULT_HISTORY;
    this.history = [];        // { key, name, output? }
    this.warnings = 0;
    this.globalCallCount = 0;
  }

  /**
   * Record a tool call and check for loops.
   * @param {string} name - Tool name
   * @param {object} input - Tool input params
   * @param {string} [lastOutput] - Previous output for no-progress detection
   * @returns {{ blocked: boolean, warning: boolean, reason?: string }}
   */
  check(name, input, lastOutput) {
    const key = name + ':' + JSON.stringify(input);
    this.history.push({ key, name, output: lastOutput });
    this.globalCallCount++;
    if (this.history.length > this.historySize) this.history.shift();

    // 1. Circuit breaker: global no-progress check
    if (this.globalCallCount >= this.circuitBreakerThreshold) {
      const uniqueKeys = new Set(this.history.map(h => h.key));
      if (uniqueKeys.size <= 2) {
        return {
          blocked: true,
          warning: false,
          reason: `Circuit breaker: ${this.globalCallCount} tool calls with only ${uniqueKeys.size} unique patterns. Stopping to prevent runaway.`
        };
      }
    }

    // 2. Generic repeat: same tool+params N times
    let streak = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].key === key) streak++;
      else break;
    }

    if (streak >= this.criticalThreshold) {
      return {
        blocked: true,
        warning: false,
        reason: `Loop detected (critical): ${name} called ${streak} times with same params. Stopping.`
      };
    }

    if (streak >= this.warningThreshold) {
      this.warnings++;
      return {
        blocked: false,
        warning: true,
        reason: `Loop warning: ${name} called ${streak} times with same params. Consider a different approach.`
      };
    }

    // 3. Known poll no-progress: polling tool with same output
    if (POLL_TOOLS.has(name) && lastOutput) {
      let sameOutputCount = 0;
      for (let i = this.history.length - 1; i >= 0; i--) {
        if (this.history[i].name === name && this.history[i].output === lastOutput) {
          sameOutputCount++;
        } else break;
      }
      if (sameOutputCount >= this.warningThreshold) {
        return {
          blocked: sameOutputCount >= this.criticalThreshold,
          warning: sameOutputCount < this.criticalThreshold,
          reason: `Poll no-progress: ${name} returned same output ${sameOutputCount} times. ${sameOutputCount >= this.criticalThreshold ? 'Stopping.' : 'Consider waiting or using a different approach.'}`
        };
      }
    }

    // 4. Ping-pong: A-B-A-B pattern
    if (this.history.length >= 6) {
      const len = this.history.length;
      const a = this.history[len - 1].key;
      const b = this.history[len - 2].key;
      if (a !== b) {
        let pingPongLen = 2;
        for (let i = len - 3; i >= 0; i--) {
          const expected = (len - 1 - i) % 2 === 0 ? a : b;
          if (this.history[i].key === expected) pingPongLen++;
          else break;
        }
        if (pingPongLen >= this.criticalThreshold * 2) {
          return { blocked: true, warning: false, reason: `Ping-pong loop: alternating ${pingPongLen} times. Stopping.` };
        }
        if (pingPongLen >= this.warningThreshold * 2) {
          return { blocked: false, warning: true, reason: `Ping-pong warning: alternating ${pingPongLen} times.` };
        }
      }
    }

    return { blocked: false, warning: false };
  }

  reset() {
    this.history = [];
    this.warnings = 0;
    this.globalCallCount = 0;
  }
}

module.exports = { LoopDetector };
