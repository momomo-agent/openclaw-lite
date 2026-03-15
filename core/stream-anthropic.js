/**
 * core/stream-anthropic.js — Anthropic streaming (via unified orchestrator)
 */
const { streamChat } = require('./stream-orchestrator')
const { anthropicAdapter } = require('./provider-anthropic')

async function streamAnthropic(messages, systemPrompt, config, requestId, tools, sessionId, wsIdentity, ctx, hooks) {
  return streamChat({ messages, systemPrompt, config, requestId, tools, sessionId, wsIdentity, ctx, adapter: anthropicAdapter, hooks })
}

module.exports = { streamAnthropic }
