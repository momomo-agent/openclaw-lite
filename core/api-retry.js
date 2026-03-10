// core/api-retry.js — Fetch with retry + exponential backoff
// OpenClaw-aligned: 3 attempts, jitter, retry-after parsing

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;
const JITTER = 0.1;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]); // 529 = Anthropic overloaded

function parseRetryAfter(res) {
  const header = res.headers?.get?.('retry-after');
  if (!header) return null;
  const secs = parseFloat(header);
  if (!isNaN(secs)) return Math.min(secs * 1000, MAX_DELAY_MS);
  const date = new Date(header);
  if (!isNaN(date.getTime())) return Math.min(date.getTime() - Date.now(), MAX_DELAY_MS);
  return null;
}

function addJitter(ms) {
  const jit = ms * JITTER * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(ms + jit));
}

async function fetchWithRetry(url, options, opts = {}) {
  const maxAttempts = opts.maxAttempts || MAX_ATTEMPTS;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, options);

      if (!RETRYABLE_STATUS.has(res.status) || attempt === maxAttempts) {
        return res;
      }

      // Retryable error — wait and try again
      const retryAfter = parseRetryAfter(res);
      const expDelay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
      const delay = retryAfter || addJitter(expDelay);

      console.warn(`[api-retry] ${res.status} on attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError') throw err; // Don't retry aborted requests

      if (attempt === maxAttempts) throw err;

      const delay = addJitter(BASE_DELAY_MS * Math.pow(2, attempt - 1));
      console.warn(`[api-retry] network error on attempt ${attempt}/${maxAttempts}: ${err.message}, retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastError || new Error('All retry attempts exhausted');
}

module.exports = { fetchWithRetry };
