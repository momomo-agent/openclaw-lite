# Paw — Methodology

## 技术栈

- **桌面框架**: Electron 33（为什么：跨平台、快速迭代、Web 技术栈门槛低；代价是包体大，但对桌面 AI 工具可接受）
- **前端**: 纯 HTML/CSS/JS，无框架（为什么：代码量小、零构建步骤、启动快；当复杂度超过 ~2000 行 JS 时考虑引入 Preact）
- **后端**: Node.js 单文件 main.js（为什么：Electron 主进程天然是 Node，不需要额外后端服务）
- **存储**: 纯文件系统 JSON（为什么：兼容 OpenClaw 格式，用户可直接编辑，git 友好）
- **LLM**: Anthropic + OpenAI 双 provider，streaming

## 架构

```
Electron Main Process (main.js)
├── Workspace Manager    — clawDir 选择/scaffold/prefs
├── Session Manager      — CRUD + 持久化 (sessions/*.json)
├── Agent Manager        — CRUD + soul/model (agents/*.json)
├── LLM Streaming        — Anthropic/OpenAI 双 provider，requestId 路由
├── Tool Executor        — 8 内置工具，sandbox 执行
├── Heartbeat Timer      — 定时 check-in
├── Memory Watcher       — fs.watch memory/ 目录
└── Tray Manager         — 系统托盘 + Watson status

Preload (preload.js)
└── IPC Bridge           — contextBridge 暴露 window.api

Renderer (renderer/)
├── Setup Screen         — 首次启动选目录
├── Chat UI              — 消息卡片 + markdown 渲染
├── Event Bus            — requestId 路由 token/tool/status
├── Settings/Members/Agents — overlay 面板
└── Watson Status        — 侧边栏 + per-card 状态行
```

## 架构决策

1. **单文件 main.js 而非分模块** — MVP 阶段代码量 <500 行，拆模块是过度工程。当超过 800 行时拆分
2. **requestId Event Bus** — 解决多轮对话串扰，每次 chat 生成唯一 ID，所有事件按 ID 路由
3. **手动签名而非 electron-builder 内置签名** — electron-builder 签名在 CI 外不稳定，手动 codesign + notarytool 更可控
4. **Watson Status 是 LLM 工具** — 状态不是前端硬编码，而是 LLM 通过 ui_status_set 工具主动更新，AI-native

## 构建与发布

```bash
# 开发
npm start

# 构建 + 签名 + 公证 + 发布（一键）
scripts/release.sh [patch|minor|major] "release notes"
```

## 分支规范

- `main`: 稳定主线，只接收通过验证的变更
- `feat/*`: 功能分支
- `fix/*`: 修复分支
- 禁止提交: `dist/`, `node_modules/`, `.DS_Store`
