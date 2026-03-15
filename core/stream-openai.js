/**
 * core/stream-openai.js — OpenAI streaming (via unified orchestrator)
 */
const { streamChat } = require('./stream-orchestrator')
const { openaiAdapter } = require('./provider-openai')

async function streamOpenAI(messages, systemPrompt, config, requestId, tools, sessionId, wsIdentity, ctx, hooks) {
  return streamChat({ messages, systemPrompt, config, requestId, tools, sessionId, wsIdentity, ctx, adapter: openaiAdapter, hooks })
}

module.exports = { streamOpenAI }
