/**
 * core/stream-openai.js — OpenAI streaming (via unified orchestrator)
 *
 * This is the public API. Delegates to stream-orchestrator + provider-openai.
 */
const { streamChat } = require('./stream-orchestrator')
const { openaiAdapter } = require('./provider-openai')

async function streamOpenAI(messages, systemPrompt, config, requestId, tools, sessionId, wsIdentity, ctx) {
  return streamChat(messages, systemPrompt, config, requestId, tools, sessionId, wsIdentity, ctx, openaiAdapter)
}

module.exports = { streamOpenAI }
