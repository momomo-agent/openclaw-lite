# Paw — Agent Context

Portable AI workspace desktop app. Electron + React (Vite + TypeScript). macOS-first. Multi-workspace IM 体验。

## Architecture

```
Electron Main (main.js ~1650 lines — orchestrator)
├── core/               — 37 modules (~4600 lines)
│   ├── state.js           — shared AppState singleton
│   ├── config.js          — config path + loader
│   ├── api-keys.js        — key rotation (429 auto-switch)
│   ├── api-retry.js       — API retry with backoff
│   ├── compaction.js      — context compaction with LLM summarization
│   ├── context-guard.js   — token budget guard
│   ├── model-context.js   — model context window info
│   ├── link-extract.js    — URL content extraction
│   ├── agents.js          — agent CRUD
│   ├── notify.js          — push status + notifications
│   ├── heartbeat.js       — heartbeat timer (delegates to CronService)
│   ├── tray.js            — tray menu
│   ├── memory-watch.js    — file watcher for memory/
│   ├── prompt-builder.js  — system prompt construction (~14k chars)
│   ├── llm-raw.js         — raw streaming (Anthropic + OpenAI)
│   ├── event-bus.js       — pub/sub event system
│   ├── router.js          — LLM routing (2-msg strategy + fuzzy match)
│   ├── tool-registry.js   — unified tool registration
│   ├── mcp-client.js      — MCP native client (stdio JSON-RPC)
│   ├── cron.js            — CronService (OpenClaw-aligned timers)
│   ├── coding-agents.js   — coding agent lifecycle + acpx
│   ├── coding-agent-registry.js — CA registration
│   ├── claude-code-sdk.js — Claude Code SDK integration
│   ├── acpx.js            — ACPX protocol client
│   ├── workspace-registry.js — multi-workspace path management
│   ├── workspace-identity.js — workspace name/avatar
│   ├── stream-anthropic.js — Anthropic SSE streaming engine
│   ├── stream-openai.js   — OpenAI SSE streaming engine
│   ├── delegate.js        — group chat delegate_to handler
│   ├── coding-agent-router.js — coding agent routing + CC session persistence
│   ├── loop-detection.js  — infinite loop prevention
│   ├── transcript-repair.js — conversation transcript repair
│   ├── session-expiry.js  — session expiration
│   ├── session-pruning.js — session cleanup
│   ├── process-manager.js — child process lifecycle
│   ├── poll-backoff.js    — polling with exponential backoff
│   └── failover.js        — provider failover
├── tools/              — 20 tool files (~1900 lines)
│   ├── registry.js        — unified tool registration system
│   ├── index.js           — tool aggregator
│   ├── agents.js          — create/remove agent tools
│   ├── claude-code.js     — Claude Code tool
│   ├── cron.js            — cron tool (8 actions)
│   ├── edit.js            — file edit tool
│   ├── exec.js            — code execution (sandbox)
│   ├── file-ops.js        — file read/write
│   ├── mcp-config.js      — MCP server management tool
│   ├── memory.js          — memory get/set/list
│   ├── notify.js          — notification tool
│   ├── search.js          — web search (Tavily)
│   ├── session-title.js   — AI session title tool
│   ├── skill-create.js    — skill scaffolding
│   ├── skill-install.js   — dependency installer
│   ├── skill.js           — skill execution
│   ├── tasks.js           — task management
│   ├── ui-status.js       — UI status updates
│   ├── web-download.js    — web content download
│   └── web-fetch.js       — web page fetch
├── Streaming engine — Anthropic SSE + OpenAI SSE, tool loop (max 5 rounds)
├── Tool dispatcher — registry (tools/) + MCP dynamic tools
├── Heartbeat — delegates to CronService, legacy fallback
├── Tray icon — menubar presence, real-time status
├── Workspace registry — multi-workspace preload + identity
├── Coding Agent — Claude Code SDK + ACPX protocol
└── IPC handlers — sessions, workspaces, config, files, tasks

React Renderer (src/ → builds to renderer/)
├── App.tsx           — main shell, workspace/session management
├── components/
│   ├── ChatView.tsx     — chat UI, streaming, delegates, tool steps
│   ├── Sidebar.tsx      — IM-style session list, status, search
│   ├── InputBar.tsx     — message input, attachments, @mention
│   ├── MessageItem.tsx  — message card rendering
│   ├── MessageList.tsx  — virtualized message list
│   ├── SettingsPanel.tsx — full settings panel
│   ├── MembersPanel.tsx — group member management
│   ├── NewChatSelector.tsx — workspace/CA picker
│   ├── SetupScreen.tsx  — cold boot / first-run wizard
│   ├── Avatar.tsx       — avatar component
│   ├── TaskBar.tsx      — task bar
│   ├── TextInput.tsx    — text input component
│   └── ToolGroup.tsx    — tool execution display
├── store/index.tsx   — React Context state management
├── hooks/            — useIPC, useSession, useDraft, useTheme
├── utils/            — agentContext, markdown, tools
├── styles/global.css — 5 themes (~1050 lines)
└── types/index.ts    — TypeScript type definitions

Preload (preload.js) — IPC bridge, contextBridge.exposeInMainWorld('api', {...})
```

## Key Files

| File | Purpose |
|------|---------|
| `main.js` | Electron main process — orchestrates everything |
| `core/` | 37 modules — state, config, streaming, tools, workspace, agents |
| `preload.js` | IPC bridge between main and renderer |
| `src/App.tsx` | React shell — workspace init, session management, routing |
| `src/components/` | 13 React components — chat, sidebar, settings, members |
| `src/store/index.tsx` | React Context state (AppProvider) |
| `src/styles/global.css` | All styles, 5 themes (dark default, codex, claude, light, plus variations) |
| `session-store.js` | SQLite backend — sessions, messages, tasks, status |
| `memory-index.js` | Memory indexing — FTS5 + optional vector search |
| `tools/` | 20 tool files, unified registry pattern |
| `skills/frontmatter.js` | SKILL.md YAML frontmatter parser |
| `skills/installer.js` | Skill dependency installer (brew/npm/go/uv) |
| `templates/` | Workspace scaffolding (SOUL.md, USER.md, BOOTSTRAP.md, etc.) |
| `vite.config.ts` | Vite build config (React + TypeScript, outputs to renderer/) |

## Conventions

- **React + TypeScript for renderer.** Vite build, outputs to `renderer/`. Main process is pure CommonJS JS.
- **Modular architecture.** core/ modules share state via core/state.js. main.js orchestrates.
- **5 themes.** Dark default (#0a0a0a), codex, claude, light — via CSS custom properties + `data-theme` attribute.
- **Chinese + English mixed.** UI labels and status can be either. User is Chinese-speaking.
- **SQLite for state.** Sessions, messages, tasks, status, memory index all in `.paw/*.db`.
- **Multi-workspace IM model.** Multiple workspaces loaded simultaneously. Sessions linked to workspaces. Group chat = multi-agent.
- **Coding Agent as participant.** Claude Code / Codex / Gemini CLI as first-class conversation participants, not just tools.
- **Event bus.** `core/event-bus.js` pub/sub, bridged to renderer via IPC. `workspace-changed` event for reactive UI updates.
- **OpenClaw compatible.** Workspace structure, memory file layout match OpenClaw format.

## Key Patterns

- **IPC**: `ipcMain.handle` → `preload.js` bridge → `window.api.*` → React hooks
- **Event bus**: `core/event-bus.js` pub/sub, bridged to renderer via `webContents.send()`
- **Tool dispatch**: LLM tool_use → `executeTool()` → MCP or registry lookup → handler(input, context)
- **Streaming**: requestId-based event matching, max 5 tool rounds per message
- **State**: Main process uses mutable `core/state.js` singleton; React uses Context (`AppProvider`)
- **Workspace lifecycle**: multi-workspace registry → preload on startup → per-session context switching
- **Coding Agent**: participant model → ACPX/SDK → delegate events → chat bubble rendering → CC session persistence
- **Workspace events**: `workspace-changed` eventBus → bridged to renderer → App.tsx global listener refreshes workspaces + sessions

## Workspace Structure (user's clawDir)

```
clawDir/
├── SOUL.md, USER.md, IDENTITY.md         # AI personality (user-facing, editable)
├── HEARTBEAT.md                           # Heartbeat checklist (user-facing)
├── MEMORY.md                              # Long-term curated memory
├── memory/                                # Shared memory (indexed, watched)
├── agents/                                # Agent JSON definitions (templates)
├── skills/                                # SKILL.md + scripts
└── .paw/                                  # Internal state (not user-facing)
    ├── config.json                        # Provider, API key, model
    ├── sessions.db                        # Sessions + messages + tasks + status
    └── memory-index.db                    # FTS5 + vector index
```

## Development

```bash
npm install
npm run dev        # Vite dev server + Electron (hot reload)
npm start          # production mode (pre-built renderer)
npm run build      # Vite build only
npm run dist       # build DMG
```

Verify before commit: `node --check main.js` + `npx tsc --noEmit`

Current branch: `react` (React rewrite, active development)

## .ai/ Directory

| File | Purpose |
|------|---------|
| `AGENT.md` | Project context for AI agents |
| `vision.md` | Product vision and goals |
| `taste.md` | Visual and interaction standards |
| `methodology.md` | Dev process, commit checklist, lessons learned |
| `growth.md` | Milestone-by-milestone growth log |
| `kanban.md` | Current work items |
| `backlog.md` | Feature backlog |
| `known-issues.md` | Bug tracker |
| `roadmap.md` | Current milestone roadmap |
| `milestones/` | Per-milestone kickoff, requirements, status |
