// core/router.js — Lightweight message routing
// Determines which agents should respond to a user message
const { streamAnthropicRaw, streamOpenAIRaw } = require('./llm-raw');

/**
 * Route a user message to the appropriate respondents.
 * @param {string} userMessage - The user's message
 * @param {Array} agents - Session agents [{name, role}]
 * @param {Array} recentHistory - Recent conversation [{prompt, answer}]
 * @param {Object} config - {provider, apiKey, baseUrl, model?}
 * @returns {Promise<Array<{name: string, focus: string}>>}
 */
async function routeMessage(userMessage, agents, recentHistory, config) {
  // No agents → Main only, zero cost
  if (!agents?.length) return [{ name: 'Main', focus: '' }];

  const names = agents.map(a => a.name);
  const validNames = new Set(['Main', ...names]);

  // Fuzzy name match: "设计师" matches "设计", "架构" matches "架构师"
  function resolveAgentName(name) {
    if (validNames.has(name)) return name;
    for (const vn of validNames) {
      if (vn.startsWith(name) || name.startsWith(vn)) return vn;
    }
    return null;
  }
  const agentList = agents.map(a => `- ${a.name}: ${a.role}`).join('\n');

  // Two-message strategy: system sets the role, user asks the routing question
  const system = `You are a routing function. Output a single JSON object, nothing else.

Available agents (use these EXACT names):
${agentList}
- Main: coordinator, handles general chat, task planning, and delegation

Rules:
- Pick 1-3 agents. Casual/greetings → Main only.
- Task management (create tasks, assign work, plan projects, break down work) → MUST include Main. Main coordinates, specialists execute.
- Specialized questions → relevant specialist(s). May also include Main if coordination is needed.
- ONLY use names from the list above. Do NOT invent new agent names.
Output: {"respondents":[{"name":"EXACT_NAME","focus":"brief instruction"}]}`;

  // Don't pass the user message as a "user" message — wrap it as a routing request
  const messages = [];
  if (recentHistory?.length) {
    const recent = recentHistory.slice(-2);
    for (const h of recent) {
      messages.push({ role: 'user', content: h.prompt });
      messages.push({ role: 'assistant', content: h.answer });
    }
  }
  messages.push({
    role: 'user',
    content: `Route this message. Reply ONLY with JSON {"respondents":[...]}, nothing else.\n\nMessage: "${userMessage}"`
  });

  const provider = config.provider || 'anthropic';
  const routerConfig = {
    ...config,
    model: config.routerModel || config.model,
    jsonMode: true,   // Anthropic prefill
    maxTokens: 150,   // Hard cap — prevents rambling
  };

  try {
    const rawFn = provider === 'anthropic' ? streamAnthropicRaw : streamOpenAIRaw;
    const raw = await rawFn(messages, system, routerConfig);
    console.log('[router] raw:', raw.slice(0, 200));

    // Extract JSON from response (handle markdown wrapping, leading text, etc.)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');

    const parsed = JSON.parse(jsonMatch[0]);
    // Support both {"respondents": [...]} and {"agents": [...]} formats
    let respondents = parsed.respondents;
    if (!respondents && Array.isArray(parsed.agents)) {
      // Model returned agent names as strings — convert to respondents format
      respondents = parsed.agents
        .map(a => typeof a === 'string' ? { name: a, focus: '' } : a)
        .filter(a => a.name);
    }
    if (Array.isArray(respondents) && respondents.length > 0) {
      const valid = respondents
        .map(r => ({ ...r, name: resolveAgentName(r.name) }))
        .filter(r => r.name);
      if (valid.length > 0) {
        console.log('[router] selected:', valid.map(r => r.name).join(', '));
        return valid;
      }
    }
  } catch (err) {
    console.warn('[router] failed:', err.message);
  }

  // Fallback: Main only
  return [{ name: 'Main', focus: '' }];
}

module.exports = { routeMessage };
