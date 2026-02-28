# Paw

Portable AI workspace. One folder, one assistant. Local-first, multi-agent, AI-native.

## What is Paw?

A desktop app that turns any folder into an AI workspace. Compatible with OpenClaw data format — point it at your existing `~/.openclaw/` or `~/clawd/` and it just works.

## Features

- **One Folder = One Workspace** — config, skills, memory, sessions, all in one directory
- **Multi-Agent Chat** — create agents with custom personalities, @mention to target
- **8 Built-in Tools** — search, code exec, file I/O, shell, notifications, skill exec, Watson status
- **AI-Native Menubar** — tray icon with real-time status, right-click menu for quick actions
- **Per-Card Status** — each response has its own status line, updated by the LLM in real-time
- **Event Bus Architecture** — requestId-based routing, no cross-talk between conversations
- **Tool Steps** — live tool execution view, auto-collapse on completion, manual toggle
- **Heartbeat** — configurable periodic check-ins, background agent work
- **Memory Sync** — shared memory/ directory with real-time file watching
- **Skills & OpenClaw** — SKILL.md injection + script execution
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
├── config.json      # provider + api key
├── agents/          # custom agents
├── sessions/        # chat history
├── memory/          # shared memory (real-time sync)
└── skills/          # capabilities (inject + execute)
```

## v0.12.0 Changelog

- **Event bus architecture** — requestId routing replaces removeAllListeners, fixes conversation cross-talk
- **AI-Native menubar** — paw-print tray icon + real-time status text + context menu
- **Per-card status line** — each response shows LLM's status, persists after completion
- **Tool steps UX** — expand during streaming, auto-collapse on done, manual toggle
- **Multi-round tool fix** — roundText separation prevents assistantContent duplication
