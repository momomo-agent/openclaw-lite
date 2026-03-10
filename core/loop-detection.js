// core/loop-detection.js — Detect repetitive tool call patterns
// OpenClaw-aligned: genericRepeat + pingPong detection

const DEFAULT_THRESHOLD = 3;   // Same tool+params N times = loop
const DEFAULT_HISTORY = 20;    // Track last N tool calls

class LoopDetector {
  constructor(opts = {}) {
    this.threshold = opts.threshold || DEFAULT_THRESHOLD;
    this.historySize = opts.historySize || DEFAULT_HISTORY;
    this.history = [];
  }

  /**
   * Record a tool call and check for loops.
   * @param {string} name - Tool name
   * @param {object} input - Tool input params
   * @returns {{ blocked: boolean, reason?: string }}
   */
  check(name, input) {
    const key = name + ':' + JSON.stringify(input);
    this.history.push(key);
    if (this.history.length > this.historySize) {
      this.history.shift();
    }

    // Generic repeat: same tool+params called N times in a row
    let streak = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i] === key) streak++;
      else break;
    }
    if (streak >= this.threshold) {
      return {
        blocked: true,
        reason: `Loop detected: ${name} called ${streak} times with same params. Stopping to prevent infinite loop.`
      };
    }

    // Ping-pong: A-B-A-B pattern (4+ alternating)
    if (this.history.length >= 4) {
      const len = this.history.length;
      const a = this.history[len - 1];
      const b = this.history[len - 2];
      if (a !== b &&
          this.history[len - 3] === a &&
          this.history[len - 4] === b) {
        // Check if it's been going even longer
        let pingPongLen = 4;
        for (let i = len - 5; i >= 0; i--) {
          const expected = (len - 1 - i) % 2 === 0 ? a : b;
          if (this.history[i] === expected) pingPongLen++;
          else break;
        }
        if (pingPongLen >= 6) {
          return {
            blocked: true,
            reason: `Ping-pong loop detected: ${name} alternating with another tool ${pingPongLen} times. Stopping.`
          };
        }
      }
    }

    return { blocked: false };
  }

  reset() {
    this.history = [];
  }
}

module.exports = { LoopDetector };
