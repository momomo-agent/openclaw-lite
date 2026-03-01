# Methodology — Paw

## 技术栈
- **Electron** — 桌面壳，macOS 先行
- **前端** — 纯 HTML/CSS/JS，不引入框架
- **LLM** — Anthropic/OpenAI streaming，直接 fetch
- **工具** — search(Tavily)/code_exec(vm sandbox)/file_read/file_write/shell_exec/notify

## 架构（v0.9.0 现状）

```
Electron Main
├── Config/Workspace Loader
├── System Prompt Builder（SOUL.md + MEMORY.md + skills/ + memory/）
├── Streaming Engine（Anthropic SSE / OpenAI SSE）
├── Tool Loop（最多 5 轮）
├── Heartbeat Timer（可配置间隔）
├── Tray Icon（状态同步）
└── Notification（Electron Notification API）
    ↕ IPC
Electron Renderer
├── Chat UI（消息/streaming/工具步骤折叠）
├── Sidebar（sessions + agent status）
├── Settings Overlay（provider/key/heartbeat）
├── Members Panel（multi-agent）
└── File Link Handler（图片预览/md渲染/系统打开）
```

## 开发流程（铁律）

遵循 `docs/dev-methodology.md`，以下是 Paw 项目的具体补充：

### 每个 feature 必须走的流程

```
1. PLAN  — 写 .ai/roadmap.md（checkbox 步骤）+ 意图确认 5 步
2. DO    — 按 roadmap 逐步执行，每步打勾
3. REVIEW — Layer 1 自审 + Layer 2 DBB + Layer 3 Review
4. GATE  — 全过才 commit
```

### commit 前必做（自审 checklist）

```
□ node --check main.js（语法校验，M9 教训）
□ node .ai/dbb/dbb-test.js（DBB 6/6）
□ E2E 对话验证（CDP 9224）
□ agent-control --pid 截图 + 目视确认
□ features.json 更新 passes
□ state.json 更新
□ growth.md 写本轮记录
```

### M8/M9 教训（已发生，不可再犯）

1. **一次只做一个 feature** — M8 塞了 5 个 feature 一起做，跳过了 PLAN，没有逐个验证
2. **Edit 匹配唯一性** — main.js 有两处 `return { answer: fullText }`，Edit 报错。用更长上下文或先 Read 确认行号
3. **插入代码破坏相邻函数** — pushStatus 插入时把 sendNotification 的函数体切断，导致语法错误。插入前后必须 Read 确认上下文完整
4. **node --check 是最后防线** — 语法错误应该在 commit 前被拦住，不是等 E2E 启动失败才发现
5. **growth.md 实时写** — 做完就记，不攒着事后补
6. **DBB 不能只跑脚本** — 必须截图 + taste.md 对照，自动化测试只验功能不验体验

## 约束（已解除）
- ~~MVP 不做：cron/heartbeat~~ → M8 已实现
- ~~MVP 不做：多窗口~~ → M7 已实现
- ~~MVP 不做：sub-agent~~ → 暂未实现，backlog B013
