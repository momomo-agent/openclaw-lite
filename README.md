# Paw

Portable AI workspace. One folder, one assistant. Local-first, multi-agent, AI-native.

## What is Paw?

A desktop app that turns any folder into an AI workspace. Compatible with OpenClaw data format — point it at your existing `~/.openclaw/` or `~/clawd/` and it just works.

## Features

- **One Folder = One Workspace** — config, skills, memory, sessions, all in one directory
- **Multi-Agent Chat** — create agents with custom personalities, @mention to target
- **Agent Team Collaboration** — shared task list, inter-agent messaging, auto-rotation
- **Pluggable Tool System** — unified registry, easy to add new tools
- **Smart Skills** — frontmatter metadata (always/requires/os/primaryEnv), auto-install dependencies
- **8+ Built-in Tools** — search, code exec, file I/O, shell, notifications, skill exec, skill install
- **API Key Rotation** — auto-switch on rate limits, multi-key support
- **AI-Native Menubar** — tray icon with real-time status, right-click menu for quick actions
- **Per-Card Status** — each response has its own status line, updated by the LLM in real-time
- **Event Bus Architecture** — requestId-based routing, no cross-talk between conversations
- **Tool Steps** — live tool execution view, auto-collapse on completion, manual toggle
- **Heartbeat** — configurable periodic check-ins, background agent work
- **Memory Sync** — shared memory/ directory with real-time file watching + semantic search
- **Skills & OpenClaw** — SKILL.md injection + script execution + dependency management
- **Multi-Window** — Cmd+Shift+N for independent workspaces
- **Multi-Provider** — Anthropic + OpenAI compatible

## Quick Start

```bash
# Development
npm install
npm start

# Build
npm run dist
```

Or download the signed DMG from [Releases](https://github.com/momomo-agent/paw/releases).

## Workspace Structure

```
~/my-workspace/
├── SOUL.md          # personality
├── MEMORY.md        # long-term memory
├── .paw/config.json # provider + api key
├── agents/          # custom agents
├── sessions/        # chat history
├── memory/          # shared memory (real-time sync)
└── skills/          # capabilities (inject + execute)
```

## v0.19.0 Changelog

**M18: Lightweight Architecture Refactor**
- Extracted 12 core modules from main.js (1243→936 lines, -25%)
- `core/state.js` — AppState singleton replaces scattered globals
- `core/config.js` — config loading with legacy path migration
- `core/prompt-builder.js` — system prompt construction (fixed duplicate task list bug)
- `core/compaction.js` — context compaction with LLM summarization
- `core/api-keys.js`, `core/llm-raw.js`, `core/agents.js`, `core/link-extract.js`
- `core/heartbeat.js`, `core/notify.js`, `core/tray.js`, `core/memory-watch.js`
- syncState() bridge between legacy globals and core modules
- DBB auto-test: 10/10 pass via Playwright CDP

## v0.18.0 Changelog

**M17: Skill Enhancement**
- Tool registration system — unified registry for pluggable tools
- Skill frontmatter parsing — YAML metadata (always/requires/os/primaryEnv/emoji)
- Skill path compression — save ~500 tokens with ~/... paths
- Environment variable injection — auto-inject from config.skillEnv
- Skill installation management — brew/npm/go/uv support with approval
- API key rotation — auto-switch on 429 rate limits

**Previous:**

- **Fix: crash on launch** — tray icon assets not included in build, causing immediate SIGTRAP crash
- **Defensive tray init** — graceful fallback when tray icon file is missing

## v0.12.0 Changelog

- **Event bus architecture** — requestId routing replaces removeAllListeners, fixes conversation cross-talk
- **AI-Native menubar** — paw-print tray icon + real-time status text + context menu
- **Per-card status line** — each response shows LLM's status, persists after completion
- **Tool steps UX** — expand during streaming, auto-collapse on done, manual toggle
- **Multi-round tool fix** — roundText separation prevents assistantContent duplication
