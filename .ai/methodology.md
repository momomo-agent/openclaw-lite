# Methodology — Paw

## 技术栈
- **Electron** — 桌面壳，macOS 先行
- **前端** — 纯 HTML/CSS/JS（从 agentic-lite web demo 演进），不引入框架
- **LLM 引擎** — agentic-lite SDK（`src/ask.ts`），直接集成不走 HTTP
- **工具层** — 搜索（Tavily）、代码执行（本地 eval）、文件操作（Node.js fs）

## 架构

```
┌─────────────────────────────────┐
│         Electron Main           │
│  ┌───────────┐ ┌─────────────┐  │
│  │ Config    │ │ Workspace   │  │
│  │ Loader    │ │ Loader      │  │
│  └─────┬─────┘ └──────┬──────┘  │
│        └───────┬───────┘        │
│          System Prompt          │
│          Builder                │
│                │                │
│        ┌───────┴───────┐        │
│        │ agentic-lite  │        │
│        │ (ask engine)  │        │
│        └───────────────┘        │
└─────────────────────────────────┘
         ↕ IPC
┌─────────────────────────────────┐
│       Electron Renderer         │
│  Chat UI (HTML/CSS/JS)          │
└─────────────────────────────────┘
```

### 两个目录
- **数据目录**（~/.openclaw/ 兼容）：config.json、skills/、memory/、SOUL.md、MEMORY.md
- **工作区目录**（~/clawd/ 兼容）：AGENTS.md、NOW.md、USER.md、项目文件

### System Prompt 构建
启动时读取数据目录和工作区的 markdown 文件，拼成 system prompt 发给 LLM。
对齐 OpenClaw 的 prompt 构建逻辑。

## 约束
- MVP 不做：消息通道（Discord/Telegram）、Gateway、cron/heartbeat、sub-agent
- MVP 不做：多窗口、多会话并行
- MVP 做：单会话对话 + 工具 + 文件读写 + system prompt 从目录构建
