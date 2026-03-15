/**
 * core/stream-anthropic.js — Anthropic streaming (via unified orchestrator)
 *
 * This is the public API. Delegates to stream-orchestrator + provider-anthropic.
 * Accepts optional `options` for steering/followup hooks.
 */
const { streamChat } = require('./stream-orchestrator')
const { anthropicAdapter } = require('./provider-anthropic')

async function streamAnthropic(messages, systemPrompt, config, requestId, tools, sessionId, wsIdentity, ctx, options) {
  return streamChat(messages, systemPrompt, config, requestId, tools, sessionId, wsIdentity, ctx, anthropicAdapter, options)
}

module.exports = { streamAnthropic }
