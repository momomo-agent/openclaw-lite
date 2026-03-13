# Methodology — Paw

## 技术栈
- **Electron** — 桌面壳，macOS 先行
- **前端** — React + Vite + TypeScript（src/ → renderer/）
- **主进程** — 纯 CommonJS JS（main.js + core/ + tools/）
- **LLM** — Anthropic/OpenAI streaming，直接 fetch
- **工具** — 20+ 内置工具（registry 模式）+ MCP 动态工具
- **数据** — SQLite（sessions/messages/tasks），JSON（config）
- **构建** — Vite（renderer）+ electron-builder（DMG）

## 架构（当前状态）

```
Electron Main (main.js ~2350 lines)
├── core/              — 33 modules (~3800 lines)
│   ├── State/Config    — state.js, config.js, workspace-registry.js, workspace-identity.js
│   ├── LLM             — llm-raw.js, api-keys.js, api-retry.js, failover.js, model-context.js
│   ├── Prompt          — prompt-builder.js, context-guard.js, compaction.js
│   ├── Routing         — router.js, loop-detection.js
│   ├── Tools           — tool-registry.js, mcp-client.js
│   ├── Agents          — agents.js, coding-agents.js, coding-agent-registry.js, claude-code-sdk.js, acpx.js
│   ├── Services        — cron.js, heartbeat.js, notify.js, tray.js, memory-watch.js, event-bus.js
│   └── Maintenance     — transcript-repair.js, session-expiry.js, session-pruning.js, process-manager.js, poll-backoff.js
├── tools/             — 20 tool files (~1900 lines)
├── skills/            — frontmatter.js + installer.js
└── IPC handlers
    ↕ preload.js bridge
React Renderer (src/ → Vite build → renderer/)
├── App.tsx            — workspace/session management shell
├── components/        — 13 components (ChatView, Sidebar, InputBar, etc.)
├── store/             — React Context state (AppProvider)
├── hooks/             — useIPC, useSession, useDraft, useTheme
├── utils/             — agentContext, markdown, tools
├── styles/global.css  — 5 themes (~1050 lines)
└── types/             — TypeScript type definitions
```

## 开发流程（铁律）

### 每个 feature 必须走的流程

```
1. PLAN  — 写 .ai/roadmap.md（checkbox 步骤）+ 意图确认
2. DO    — 按 roadmap 逐步执行，每步打勾
3. REVIEW — Layer 1 自审 + Layer 2 DBB + Layer 3 Review
4. GATE  — 全过才 commit
```

### commit 前必做（自审 checklist）

```
□ node --check main.js（语法校验）
□ npx tsc --noEmit（TypeScript 类型检查）
□ npx vite build（Vite 构建通过）
□ 新增目录/文件 → 检查 package.json build.files 是否包含
□ E2E 对话验证
□ growth.md 写本轮记录
```

### 历史教训（已发生，不可再犯）

1. **一次只做一个 feature** — M8 塞了 5 个 feature 一起做，跳过了 PLAN，没有逐个验证
2. **Edit 匹配唯一性** — main.js 有两处相同代码，Edit 报错。用更长上下文或先 Read 确认行号
3. **插入代码破坏相邻函数** — pushStatus 插入时把 sendNotification 的函数体切断。插入前后必须 Read 确认上下文完整
4. **node --check 是最后防线** — 语法错误应在 commit 前拦住
5. **growth.md 实时写** — 做完就记，不攒着事后补
6. **DBB 不能只跑脚本** — 必须截图 + taste.md 对照
7. **新增目录必须加 build.files** — v0.18.0 加了 tools/ 和 skills/ 但没加到 package.json build.files，生产环境 crash
8. **发布前必须启动测试打包产物** — 测试 dist/ 里的 .app，不只是 npm start
9. **工具调用路径必须端到端验证** — node --check 只验语法，新增 LLM 工具后必须实际触发一次完整调用链
