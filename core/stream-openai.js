/**
 * core/stream-openai.js — OpenAI streaming (via unified orchestrator)
 *
 * This is the public API. Delegates to stream-orchestrator + provider-openai.
 * Accepts optional `options` for steering/followup hooks.
 */
const { streamChat } = require('./stream-orchestrator')
const { openaiAdapter } = require('./provider-openai')

async function streamOpenAI(messages, systemPrompt, config, requestId, tools, sessionId, wsIdentity, ctx, options) {
  return streamChat(messages, systemPrompt, config, requestId, tools, sessionId, wsIdentity, ctx, openaiAdapter, options)
}

module.exports = { streamOpenAI }
