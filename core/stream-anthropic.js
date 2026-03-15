/**
 * core/stream-anthropic.js — Anthropic streaming (via unified orchestrator)
 *
 * This is the public API. Delegates to stream-orchestrator + provider-anthropic.
 */
const { streamChat } = require('./stream-orchestrator')
const { anthropicAdapter } = require('./provider-anthropic')

async function streamAnthropic(messages, systemPrompt, config, requestId, tools, sessionId, wsIdentity, ctx) {
  return streamChat(messages, systemPrompt, config, requestId, tools, sessionId, wsIdentity, ctx, anthropicAdapter)
}

module.exports = { streamAnthropic }
