# Paw

Portable AI workspace. One folder, one assistant. Local-first, multi-workspace, AI-native IM.

## What is Paw?

A desktop app that turns any folder into an AI workspace. Multiple workspaces load simultaneously — like an IM app where each contact is an AI assistant with its own personality, memory, and skills. Compatible with OpenClaw data format.

## Features

- **Multi-Workspace IM** — multiple AI assistants in one window, switch like a chat app
- **One Folder = One Workspace** — config, skills, memory, sessions, all in one directory
- **Group Chat = Multi-Agent** — @mention to target specific AI, group owner as default responder
- **Coding Agent as Participant** — Claude Code / Codex / Gemini CLI as first-class chat participants
- **20+ Built-in Tools** — search, code exec, file I/O, shell, notifications, skills, MCP, cron, web fetch/download
- **MCP Support** — native MCP client, stdio JSON-RPC, dynamic tool registration
- **Cron & Heartbeat** — scheduled tasks with OpenClaw-aligned timers
- **Pluggable Tool System** — unified registry + MCP dynamic tools
- **Smart Skills** — frontmatter metadata, auto-install dependencies (brew/npm/go/uv)
- **API Key Rotation** — auto-switch on rate limits, multi-key support
- **5 Themes** — dark (default), codex, claude, light, and variations
- **AI-Native Menubar** — tray icon with real-time status
- **Per-Card Status** — each response has its own status line
- **Event Bus Architecture** — requestId-based routing, no cross-talk
- **Memory Sync** — shared memory/ directory with real-time file watching + semantic search
- **Multi-Provider** — Anthropic + OpenAI compatible

## Quick Start

```bash
# Development (Vite hot reload + Electron)
npm install
npm run dev

# Production
npm start

# Build DMG
npm run dist
```

Or download the signed DMG from [Releases](https://github.com/momomo-agent/paw/releases).

## Tech Stack

- **Main process**: Electron, pure CommonJS JS (~2350 lines + 33 core modules + 20 tool files)
- **Renderer**: React + Vite + TypeScript (13 components, 5 themes)
- **Data**: SQLite (sessions/messages/tasks), JSON (config), file-based (memory, skills)
- **Build**: Vite (renderer) + electron-builder (DMG)

## Workspace Structure

```
~/my-workspace/
├── SOUL.md          # personality
├── USER.md          # user context
├── IDENTITY.md      # workspace identity
├── MEMORY.md        # long-term memory
├── HEARTBEAT.md     # heartbeat checklist
├── memory/          # shared memory (real-time sync + FTS5 index)
├── agents/          # agent JSON templates
├── skills/          # SKILL.md + scripts (auto-install deps)
└── .paw/            # internal state
    ├── config.json      # provider + API key + model
    ├── sessions.db      # sessions + messages + tasks
    └── memory-index.db  # FTS5 + vector index
```

## Recent Changelog

### M38 — Coding Agent as Participant
- Coding Agent (Claude Code) upgraded from tool panel to first-class chat participant
- Claude Code SDK integration with real-time streaming
- Unified workspace architecture — coding agents share participant model
- Workspace-changed global event for reactive UI updates

### M34 — UI Polish
- React rewrite (Vite + TypeScript) replacing vanilla renderer
- 5 theme system, frosted glass headers, bootstrap ritual
- Per-session streaming architecture, thinking persistence

### M33 — Skill Creator + MCP + Cron
- MCP native client (stdio JSON-RPC) with dynamic tool registration
- CronService aligned with OpenClaw timers
- Skill creator tool + frontmatter parser rewrite
- Heartbeat refactored to delegate to CronService

### M32 — Multi-Workspace IM
- Multi-workspace simultaneous loading with IM-style sidebar
- Group chat with @mention routing and participant management
- Coding Agent direct chat + CLI streaming
- IM sidebar redesign (flat list, status switching)
