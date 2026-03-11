// core/llm-raw.js — LLM 非流式调用（用于 heartbeat 等）
const { getApiKey, rotateApiKey, recordKeyUsage } = require('./api-keys');

async function streamAnthropicRaw(messages, system, config) {
  const base = (config.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
  const endpoint = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`;
  const apiKey = getApiKey(config);

  // For JSON mode, add prefill to force JSON output
  const msgs = [...messages];
  if (config.jsonMode) msgs.push({ role: 'assistant', content: '{' });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: config.model || 'claude-sonnet-4-20250514', max_tokens: config.maxTokens || 2048, system, messages: msgs }),
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
  let text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  if (config.jsonMode) text = '{' + text; // Prepend the prefill
  return text;
}

async function streamOpenAIRaw(messages, system, config) {
  const base = (config.baseUrl || 'https://api.openai.com').replace(/\/+$/, '');
  const endpoint = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  const apiKey = getApiKey(config);

  const body = {
    model: config.model || 'gpt-4o',
    max_tokens: config.maxTokens || 2048,
    messages: [{ role: 'system', content: system }, ...messages],
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
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

// Streaming variant — calls onToken(text) for each chunk, returns full text
// Also calls onThinking(text) for thinking/reasoning blocks
async function streamAnthropicRawStreaming(messages, system, config, onToken, onThinking) {
  const base = (config.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
  const endpoint = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`;
  const apiKey = getApiKey(config);
  const msgs = [...messages];

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: config.model || 'claude-sonnet-4-20250514', max_tokens: config.maxTokens || 2048, stream: true, system, messages: msgs }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    recordKeyUsage(false);
    if (res.status === 429 && rotateApiKey(config)) {
      return streamAnthropicRawStreaming(messages, system, config, onToken, onThinking);
    }
    throw new Error(`API ${res.status}`);
  }

  recordKeyUsage(true);
  let fullText = '';
  let thinkingText = '';
  let currentBlockType = null;
  const reader = res.body;
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of reader) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (json === '[DONE]') continue;
      try {
        const evt = JSON.parse(json);
        if (evt.type === 'content_block_start') {
          currentBlockType = evt.content_block?.type || null;
        } else if (evt.type === 'content_block_stop') {
          currentBlockType = null;
        } else if (evt.type === 'content_block_delta') {
          if (evt.delta?.type === 'text_delta') {
            const t = evt.delta.text;
            fullText += t;
            if (onToken) onToken(t);
          } else if (evt.delta?.type === 'thinking_delta') {
            const t = evt.delta.thinking;
            thinkingText += t;
            if (onThinking) onThinking(t);
          }
        }
      } catch {}
    }
  }
  return { text: fullText, thinking: thinkingText };
}

async function streamOpenAIRawStreaming(messages, system, config, onToken) {
  const base = (config.baseUrl || 'https://api.openai.com').replace(/\/+$/, '');
  const endpoint = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  const apiKey = getApiKey(config);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: config.model || 'gpt-4o', max_tokens: config.maxTokens || 2048, stream: true, messages: [{ role: 'system', content: system }, ...messages] }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    recordKeyUsage(false);
    if (res.status === 429 && rotateApiKey(config)) {
      return streamOpenAIRawStreaming(messages, system, config, onToken);
    }
    throw new Error(`API ${res.status}`);
  }

  recordKeyUsage(true);
  let fullText = '';
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (json === '[DONE]') continue;
      try {
        const evt = JSON.parse(json);
        const t = evt.choices?.[0]?.delta?.content;
        if (t) { fullText += t; if (onToken) onToken(t); }
      } catch {}
    }
  }
  return fullText;
}

module.exports = { streamAnthropicRaw, streamOpenAIRaw, streamAnthropicRawStreaming, streamOpenAIRawStreaming };
