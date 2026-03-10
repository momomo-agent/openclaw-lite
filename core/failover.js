// core/failover.js — Model failover with exponential cooldown
// OpenClaw-aligned: 1m → 5m → 25m → 1h cap + billing disable detection

const COOLDOWN_STEPS = [60000, 300000, 1500000, 3600000]; // 1m, 5m, 25m, 1h
const BILLING_PATTERNS = [
  /insufficient.*credit/i,
  /credit.*balance.*low/i,
  /billing/i,
  /payment.*required/i,
  /quota.*exceeded/i,
];

class FailoverManager {
  constructor() {
    this.cooldowns = new Map(); // model -> { until, errorCount }
  }

  isAvailable(model) {
    const cd = this.cooldowns.get(model);
    if (!cd) return true;
    if (Date.now() >= cd.until) {
      this.cooldowns.delete(model);
      return true;
    }
    return false;
  }

  recordFailure(model, errorMessage) {
    const cd = this.cooldowns.get(model) || { until: 0, errorCount: 0 };
    cd.errorCount++;

    // Billing errors get longer cooldown
    const isBilling = BILLING_PATTERNS.some(p => p.test(errorMessage));
    if (isBilling) {
      cd.until = Date.now() + 18000000; // 5 hours for billing
      cd.reason = 'billing';
    } else {
      const stepIdx = Math.min(cd.errorCount - 1, COOLDOWN_STEPS.length - 1);
      cd.until = Date.now() + COOLDOWN_STEPS[stepIdx];
      cd.reason = 'error';
    }

    this.cooldowns.set(model, cd);
    return cd;
  }

  getStatus() {
    const now = Date.now();
    const result = {};
    for (const [model, cd] of this.cooldowns) {
      if (now < cd.until) {
        result[model] = {
          cooldownMs: cd.until - now,
          errorCount: cd.errorCount,
          reason: cd.reason,
        };
      }
    }
    return result;
  }

  reset(model) {
    if (model) this.cooldowns.delete(model);
    else this.cooldowns.clear();
  }
}

module.exports = { FailoverManager };
