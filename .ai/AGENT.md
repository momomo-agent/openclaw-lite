# Paw — Agent Context

Portable AI workspace desktop app. Electron, pure JS, no framework. Compatible with OpenClaw data format.

## Architecture

```
Electron Main (main.js ~950 lines — the core)
├── core/           — M18 refactored modules
│   ├── state.js        — shared state object
│   ├── config.js       — config path + loader
│   ├── api-keys.js     — key rotation
│   ├── compaction.js   — context compaction
│   ├── link-extract.js — URL content extraction
│   ├── agents.js       — agent CRUD
│   ├── notify.js       — push status + notifications
│   ├── heartbeat.js    — heartbeat timer
│   ├── tray.js         — tray menu
│   ├── memory-watch.js — file watcher
│   ├── prompt-builder.js — system prompt construction
│   └── llm-raw.js     — raw streaming (Anthropic + OpenAI)
├── Streaming engine — Anthropic SSE + OpenAI SSE, tool loop (max 5 rounds)
├── Tool dispatcher — registry (tools/) + built-in (ui_status_set, notify, memory_*, task_*)
├── Heartbeat timer — default-on, 30 min, reads HEARTBEAT.md
├── pushWatsonStatus() — AI-authored sidebar status, persisted to SQLite
├── Tray icon — menubar presence, real-time status
└── IPC handlers — sessions, agents, config, files, tasks

Electron Renderer (renderer/)
├── app.js — chat UI, session management, status, bootstrap
├── index.html — layout + settings overlay + members panel + agent manager
├── style.css — dark theme (#0a0a0a), single file
└── lib/ — marked.js, highlight.js (vendored)

Preload (preload.js) — IPC bridge, contextBridge.exposeInMainWorld('api', {...})
```

## Key Files

| File | Purpose |
|------|---------|
| `main.js` | Electron main process — config, prompt, streaming, tools, heartbeat, tray |
| `core/` | M18 refactored modules — state, config, API keys, compaction, etc. |
| `preload.js` | IPC bridge between main and renderer |
| `renderer/app.js` | Chat UI, session management, status display, bootstrap |
| `renderer/index.html` | HTML layout, settings panel, overlays |
| `renderer/style.css` | All styles, dark theme |
| `session-store.js` | SQLite backend — sessions, messages, tasks, session agents, status persistence |
| `memory-index.js` | Memory indexing — FTS5 + optional vector search |
| `tools/registry.js` | Unified tool registration system |
| `tools/*.js` | Individual tools: web-fetch, file-ops, exec, search, skill, skill-install |
| `skills/frontmatter.js` | SKILL.md YAML frontmatter parser |
| `skills/installer.js` | Skill dependency installer (brew/npm/go/uv) |
| `templates/` | Workspace scaffolding files (SOUL.md, USER.md, etc.) |

## Conventions

- **Pure JS, no TypeScript, no framework.** Vanilla HTML/CSS/JS in renderer. CommonJS in main.
- **M18 modular architecture.** core/ modules share state via core/state.js. main.js orchestrates.
- **Dark theme only.** Background #0a0a0a, accent #fbbf24, -apple-system font stack.
- **Chinese + English mixed.** UI labels and status can be either. User is Chinese-speaking.
- **SQLite for state.** Sessions, tasks, session agents, status, memory index all in `.paw/*.db`. No JSON files for state.
- **Two-tier agent model (M19).** Main Agent = SOUL.md + workspace memory (always present, default responder). Lightweight agents = session-level, name + role only, stored in session_agents table.
- **agents/ = template library.** Persistent agent definitions in agents/*.json are templates, not active agents. Used to quickly create lightweight agents in sessions.
- **OpenClaw compatible.** Workspace structure, cold boot chain, memory file layout all match OpenClaw.

## Workspace Structure (user's clawDir)

```
clawDir/
├── SOUL.md, USER.md, IDENTITY.md, AGENTS.md  # AI personality (user-facing, editable)
├── HEARTBEAT.md                                # Heartbeat checklist (user-facing)
├── MEMORY.md                                   # Long-term curated memory
├── memory/                                     # Shared memory (indexed, watched)
├── agents/                                     # Agent JSON definitions
├── skills/                                     # SKILL.md + scripts
└── .paw/                                       # Internal state (not user-facing)
    ├── config.json                             # Provider, API key, model
    ├── sessions.db                             # Sessions + messages + tasks + status
    └── memory-index.db                         # FTS5 + vector index
```

## Development

```bash
npm install
npm start          # dev mode
npm run dist       # build DMG
```

Verify before commit: `node --check main.js`

## .ai/ Directory

| File | Purpose |
|------|---------|
| `AGENT.md` | This file — project context for AI agents |
| `vision.md` | Product vision and goals |
| `taste.md` | Visual and interaction standards |
| `methodology.md` | Dev process, commit checklist, lessons learned |
| `growth.md` | Milestone-by-milestone growth log |
| `kanban.md` | Current work items |
| `backlog.md` | Feature backlog (B001-B041) |
| `known-issues.md` | Bug tracker |
| `roadmap.md` | Current milestone roadmap |
| `milestones/` | Per-milestone kickoff, requirements, status |
