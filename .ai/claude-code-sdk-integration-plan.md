# Claude Code SDK Integration — Architecture Plan

## Vision

Replace CLI spawn with **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) for:
- ✨ **Real-time streaming** — text tokens arrive as they're generated, not after completion
- 🎯 **Rich events** — tool use, thinking, status updates all exposed
- 🔧 **Better control** — permission callbacks, tool filtering, session management
- 💎 **Type safety** — full TypeScript definitions
- 🚀 **Performance** — no process spawn overhead, direct Node.js integration

---

## Current Architecture (CLI-based)

```
User sends "hi" → routeToCodingAgent()
  ↓
spawn(`claude --print --output-format stream-json hi`)
  ↓
Parse NDJSON lines → extract text → onOutput(text)
  ↓
eventBus.dispatch('chat-token', { text })
  ↓
Frontend receives token → updates UI
```

**Problems:**
- `--print` waits for full completion before outputting (non-streaming UX)
- `--output-format stream-json` requires manual NDJSON parsing
- No access to thinking, tool progress, or rich metadata
- Process spawn overhead (~100ms startup)
- Hard to handle errors, permissions, or session continuity

---

## New Architecture (SDK-based)

```
User sends "hi" → routeToCodingAgent()
  ↓
SDK: session.send("hi")
  ↓
for await (const msg of session.stream()) {
  ↓
  SDKPartialAssistantMessage → extract text delta
    → eventBus.dispatch('chat-token', { text: delta })
  ↓
  SDKAssistantMessage (complete) → full message
    → eventBus.dispatch('chat-done')
}
```

**Benefits:**
- Real-time streaming — tokens arrive immediately
- Rich event types — thinking, tool use, status all available
- Session persistence — resume conversations via `sessionId`
- Type-safe API — no manual JSON parsing
- Permission control — `canUseTool` callback for fine-grained control

---

## Implementation Plan

### 1. Install SDK

```bash
npm install @anthropic-ai/claude-agent-sdk
```

### 2. Create `core/claude-code-sdk.js`

Wrapper module that:
- Creates/resumes SDK sessions
- Maps SDK events → Paw event bus
- Handles streaming text extraction
- Manages session lifecycle

```js
const { unstable_v2_createSession, unstable_v2_resumeSession } = require('@anthropic-ai/claude-agent-sdk')

class ClaudeCodeSession {
  constructor({ cwd, sessionId, onToken, onDone, onError }) {
    this.cwd = cwd
    this.sessionId = sessionId
    this.onToken = onToken
    this.onDone = onDone
    this.onError = onError
    this.session = null
  }

  async send(message) {
    if (!this.session) {
      this.session = this.sessionId
        ? unstable_v2_resumeSession(this.sessionId, this._getOptions())
        : unstable_v2_createSession(this._getOptions())
    }

    await this.session.send(message)

    for await (const msg of this.session.stream()) {
      if (msg.type === 'stream_event') {
        // Extract text delta from BetaRawMessageStreamEvent
        const delta = this._extractTextDelta(msg.event)
        if (delta) this.onToken(delta)
      } else if (msg.type === 'assistant') {
        // Complete message
        const fullText = this._extractFullText(msg.message)
        this.onDone(fullText)
        break
      } else if (msg.type === 'result') {
        // Final result with metadata
        this.onDone(msg.result, { usage: msg.usage, cost: msg.total_cost_usd })
        break
      }
    }
  }

  _getOptions() {
    return {
      model: 'claude-opus-4-6',
      env: { ...process.env, CLAUDE_CWD: this.cwd },
      allowedTools: ['*'], // or specific list
      canUseTool: async (toolName, input) => {
        // Permission callback — always allow for now
        return { allowed: true }
      }
    }
  }

  _extractTextDelta(event) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      return event.delta.text
    }
    return null
  }

  _extractFullText(message) {
    return message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
  }

  close() {
    if (this.session) this.session.close()
  }
}

module.exports = { ClaudeCodeSession }
```

### 3. Update `routeToCodingAgent` in `main.js`

Replace CLI spawn with SDK session:

```js
async function routeToCodingAgent(engine, workdir, message, { sessionId, requestId, senderName, senderAvatar }) {
  if (engine !== 'claude') {
    // Fallback to CLI for other engines (codex, gemini, kiro)
    return routeToCodingAgentCLI(engine, workdir, message, { sessionId, requestId, senderName, senderAvatar })
  }

  const parentRequestId = requestId || _activeRequestId
  if (parentRequestId && senderName) {
    eventBus.dispatch('chat-delegate-start', { requestId: parentRequestId, sender: senderName, workspaceId: `ca:${engine}:${workdir}`, avatar: senderAvatar, sessionId })
  } else if (parentRequestId) {
    eventBus.dispatch('chat-text-start', { requestId: parentRequestId, sessionId })
  }

  let output = ''
  const ccSessionKey = `${sessionId}-${engine}-${workdir}`
  const existingSessionId = sessionCCSessions.get(ccSessionKey)

  const { ClaudeCodeSession } = require('./core/claude-code-sdk')
  const session = new ClaudeCodeSession({
    cwd: workdir,
    sessionId: existingSessionId,
    onToken: (delta) => {
      output += delta
      if (parentRequestId && senderName) {
        eventBus.dispatch('chat-delegate-token', { requestId: parentRequestId, sender: senderName, token: delta, sessionId })
      } else if (parentRequestId) {
        eventBus.dispatch('chat-token', { requestId: parentRequestId, text: delta, sessionId })
      }
    },
    onDone: (fullText, metadata) => {
      if (!existingSessionId && session.session?.sessionId) {
        sessionCCSessions.set(ccSessionKey, session.session.sessionId)
      }
    },
    onError: (err) => {
      console.error(`[claude-code-sdk] error:`, err)
    }
  })

  try {
    await session.send(message)
    if (parentRequestId && senderName) {
      eventBus.dispatch('chat-delegate-end', { requestId: parentRequestId, sender: senderName, sessionId })
    }
    return output || 'Coding agent completed'
  } catch (err) {
    if (parentRequestId && senderName) {
      eventBus.dispatch('chat-delegate-end', { requestId: parentRequestId, sender: senderName, sessionId })
    }
    return `Error: ${err.message}`
  } finally {
    session.close()
  }
}
```

### 4. Preserve CLI fallback for other engines

Keep `coding-agents.js` for codex/gemini/kiro, rename `routeToCodingAgent` → `routeToCodingAgentCLI`.

---

## Event Mapping

| SDK Event | Paw Event | Notes |
|-----------|-----------|-------|
| `stream_event` (text_delta) | `chat-token` | Real-time text streaming |
| `stream_event` (thinking) | `chat-thinking` | Extended thinking blocks (future) |
| `assistant` (complete) | — | Full message, extract final text |
| `result` | `chat-done` | Final result with usage/cost metadata |
| Tool use events | `chat-tool-step` | Future: expose tool progress |

---

## Migration Strategy

1. ✅ **Phase 1: Install SDK + wrapper module** — `core/claude-code-sdk.js`
2. ✅ **Phase 2: Update `routeToCodingAgent` for claude engine** — SDK path
3. ✅ **Phase 3: Keep CLI fallback** — codex/gemini/kiro still use spawn
4. ✅ **Phase 4: Test streaming UX** — verify real-time token display
5. 🔮 **Phase 5 (future): Expose thinking + tool progress** — richer UI

---

## Code Quality Standards

- **Type safety**: Use TypeScript types from SDK (`SDKMessage`, `SDKSession`, etc.)
- **Error handling**: Graceful fallback if SDK fails (network, auth, etc.)
- **Session cleanup**: Always call `session.close()` in finally block
- **Memory management**: Clear old sessions from `sessionCCSessions` Map
- **Logging**: Structured logs for debugging (`[claude-code-sdk]` prefix)

---

## Testing Checklist

- [ ] Real-time streaming — tokens appear immediately, not after completion
- [ ] Session continuity — second message in same session resumes context
- [ ] Error handling — network failures, auth errors gracefully handled
- [ ] Title auto-set — still works after SDK migration
- [ ] Multi-turn — user can send multiple messages in same session
- [ ] CLI fallback — codex/gemini/kiro still work via spawn

---

## Future Enhancements

- **Thinking blocks** — expose `<thinking>` tags in UI
- **Tool progress** — show "Reading file X", "Running command Y" in real-time
- **Permission UI** — `canUseTool` callback → modal for user approval
- **Cost tracking** — display API cost per message
- **Model selection** — let user choose opus/sonnet/haiku per session

---

## References

- SDK package: `@anthropic-ai/claude-agent-sdk` v0.2.74
- Docs: https://platform.claude.com/docs/en/agent-sdk/overview
- Types: `/tmp/package/sdk.d.ts` (extracted from npm package)
