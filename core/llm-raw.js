// core/llm-raw.js — LLM 非流式调用（用于 heartbeat 等）
const { getApiKey, rotateApiKey, recordKeyUsage } = require('./api-keys');

async function streamAnthropicRaw(messages, system, config) {
  const base = (config.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
  const endpoint = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`;
  const apiKey = getApiKey(config);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: config.model || 'claude-sonnet-4-20250514', max_tokens: 2048, system, messages }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    recordKeyUsage(false);
    if (res.status === 429 && rotateApiKey(config)) {
      return streamAnthropicRaw(messages, system, config);
    }
    throw new Error(`API ${res.status}`);
  }

  recordKeyUsage(true);
  const data = await res.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}

async function streamOpenAIRaw(messages, system, config) {
  const base = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const apiKey = getApiKey(config);

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: config.model || 'gpt-4o', max_tokens: 2048, messages: [{ role: 'system', content: system }, ...messages] }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    recordKeyUsage(false);
    if (res.status === 429 && rotateApiKey(config)) {
      return streamOpenAIRaw(messages, system, config);
    }
    throw new Error(`API ${res.status}`);
  }

  recordKeyUsage(true);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

module.exports = { streamAnthropicRaw, streamOpenAIRaw };
