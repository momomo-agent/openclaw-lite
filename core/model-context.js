// core/model-context.js — Resolve context window size from model
// OpenClaw-aligned: per-model context windows

const MODEL_CONTEXT_WINDOWS = {
  // Anthropic
  'claude-opus-4': 200000,
  'claude-sonnet-4': 200000,
  'claude-sonnet-4-20250514': 200000,
  'claude-haiku-3.5': 200000,
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
  'claude-3.5-sonnet': 200000,
  'claude-3.5-haiku': 200000,
  // OpenAI
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 16385,
  'o1': 200000,
  'o1-mini': 128000,
  'o1-pro': 200000,
  'o3': 200000,
  'o3-mini': 200000,
  'o4-mini': 200000,
  // DeepSeek
  'deepseek-chat': 64000,
  'deepseek-coder': 64000,
  'deepseek-v3': 64000,
  'deepseek-r1': 64000,
  // Gemini
  'gemini-2.5-pro': 1000000,
  'gemini-2.5-flash': 1000000,
  'gemini-2.0-flash': 1000000,
  'gemini-1.5-pro': 2000000,
  'gemini-1.5-flash': 1000000,
};

const DEFAULT_CONTEXT_TOKENS = 128000;

/**
 * Resolve context window tokens for a model.
 * Checks config.contextTokens first, then model name lookup, then default.
 */
function resolveContextWindow(config) {
  // User override
  if (config?.contextTokens && typeof config.contextTokens === 'number' && config.contextTokens > 0) {
    return config.contextTokens;
  }
  const model = (config?.model || '').toLowerCase();
  // Exact match
  if (MODEL_CONTEXT_WINDOWS[model]) return MODEL_CONTEXT_WINDOWS[model];
  // Prefix match
  for (const [key, tokens] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (model.startsWith(key)) return tokens;
  }
  return DEFAULT_CONTEXT_TOKENS;
}

module.exports = { resolveContextWindow, MODEL_CONTEXT_WINDOWS, DEFAULT_CONTEXT_TOKENS };
