# Paw 架构方向

> 2026-03-15 — 从 v0.23.0 (M35) 开始的架构演进方向

## 现状诊断

### 好的部分
- **事件总线** — requestId 路由，对话隔离干净
- **SQLite per-workspace** — 每个 workspace 独立 DB，数据归属清晰
- **工具注册表** — tools/ 目录 + registerTool，插件化已有雏形
- **多 provider** — Anthropic + OpenAI 双通道，failover 支持

### 需要改进的部分

#### 1. main.js God File（1880 行，118 个 function/IPC）
**问题：** window management、session routing、chat handler、IPC dispatch、tray、memory index 全在一个文件。
**影响：** 改一个功能要在 1880 行里定位，容易引入副作用。

#### 2. Streaming 逻辑重复
**问题：** stream-anthropic.js (273行) 和 stream-openai.js (204行) 有 60%+ 重复代码（roundText/fullText 管理、工具循环、usage 统计、stall detection、status push）。
**影响：** 改一个 bug 要两个文件都改（今天改了 5 次都是两文件同步），容易漏。

#### 3. ChatView.tsx 事件地狱（985 行）
**问题：** 40+ 个 IPC 事件监听器手动绑定/解绑，streaming state 管理用 refs 手动维护。
**影响：** 事件绑定顺序、cleanup 时序都是潜在 bug 源。

#### 4. Prompt 不可组合
**问题：** prompt-builder.js 硬编码所有 prompt 文本，workspace 没有自定义能力。
**影响：** 每个 workspace 的 AI 行为完全相同，只有 SOUL.md 能区分人格，但工具使用习惯、回复风格无法定制。

## 架构方向

### 方向 1：Streaming 统一层（✅ 已完成 — 2a7249f）

**目标：** 一套 streaming 核心循环，provider 只负责协议解析。

**参考：** pi-agent/OpenClaw 的三层架构：
- **pi-ai** — 最底层 LLM 调用，每个 provider 实现 `StreamFunction`，SSE → 统一 `AssistantMessageEvent` 流
- **pi-agent-core** — 中间层 `agentLoop()`，管 tool loop + context + steering
- **openclaw** — 最上层 `pi-embedded-runner`，管 retry/failover/compaction/usage/session

Paw 对应关系：
- `stream-orchestrator.js` ≈ pi-agent-core 的 `agentLoop`
- `provider-anthropic.js` / `provider-openai.js` ≈ pi-ai 的各 provider
- main.js 的 chat handler ≈ openclaw 的 `pi-embedded-runner`

当前与 pi-agent 的差距（后续可改进）：
1. pi-ai 的 provider 返回 `EventStream`（async iterator），Paw 还是 parseSSE 回调
2. pi-agent-core 的 `convertToLlm` 把消息格式转换和 LLM 调用分离，Paw 混在 adapter 里
3. pi-agent 支持 `getSteeringMessages()` 和 `getFollowUpMessages()`，Paw 还没有

```
                  ┌─────────────────────────┐
                  │    StreamOrchestrator    │   ← core/stream-orchestrator.js
                  │                         │
                  │  - round loop           │
                  │  - tool execution       │
                  │  - usage tracking       │
                  │  - stall detection      │
                  │  - status push          │
                  │  - loop detection       │
                  └──────┬──────────────────┘
                         │ adapter pattern
              ┌──────────┴──────────┐
              │                     │
    ┌─────────▼──────┐   ┌─────────▼──────┐
    │ provider-       │   │ provider-       │
    │ anthropic.js    │   │ openai.js       │
    │                 │   │                 │
    │ prepareRequest  │   │ prepareRequest  │
    │ parseSSE        │   │ parseSSE        │
    │ buildMessages   │   │ buildMessages   │
    └─────────────────┘   └────────────────┘
```

**已完成：** 2026-03-15, commit 2a7249f
- stream-orchestrator.js (300行) — 通用轮循环
- provider-anthropic.js (200行) — Anthropic 适配器
- provider-openai.js (180行) — OpenAI 适配器
- stream-anthropic.js + stream-openai.js 变成 10 行 wrapper
- 向后兼容，main.js 不需要改

### 方向 2：main.js 分层（高优先级）

**目标：** 按职责拆成 3 层。

```
main.js (< 300 行)
├── Electron lifecycle (app ready, window create, dock)
├── Menu & tray setup
└── Module wiring (connect layers)

core/ipc-handlers.js
├── All ipcMain.handle registrations
├── Input validation
└── Delegates to services

core/chat-service.js
├── Chat routing (which provider, which workspace)
├── Tool execution context
├── History management
└── Error classification
```

**收益：**
- main.js 只管 Electron，清晰易读
- IPC 层和业务逻辑解耦
- 新功能不用在 1880 行里找位置

### 方向 3：Renderer 事件简化（中优先级）

**目标：** ChatView 不直接监听 40+ IPC 事件，改用 typed event dispatcher。

```typescript
// 现在：40+ 个 useEffect + 手动绑定
useEffect(() => {
  const h1 = api.onChatToken(...)
  const h2 = api.onChatDone(...)
  const h3 = api.onWatsonStatus(...)
  // ... 40 more
  return () => { h1(); h2(); h3(); ... }
}, [])

// 改成：一个 hook 管所有
useChatEvents(sessionId, {
  onToken: (text) => ...,
  onDone: (msg) => ...,
  onStatus: (level, text) => ...,
  onToolStep: (step) => ...,
})
```

**收益：**
- 事件绑定/解绑自动管理
- TypeScript 类型安全
- 新事件加一行就行

### 方向 4：Prompt 组合架构（后续）

**目标：** prompt 分层可配置。

```
System Prompt = merge(
  core/base-prompt.md        // 不变的基础能力描述
  workspace/SOUL.md          // 人格
  workspace/.paw/prompt.md   // workspace 自定义 prompt（可选）
  auto-generated/tools.md    // 从 tool registry 自动生成
  auto-generated/context.md  // ambient context
)
```

**收益：**
- Workspace 可以自定义 AI 行为（不只是人格）
- 工具 prompt 自动同步，不需要手写
- 新工具自动出现在 prompt 里

## 执行顺序

1. **M36: Streaming 统一层** — 最高 ROI，修 bug 痛点最大
2. **M37: main.js 分层** — 清理基础，后续开发更快
3. **M38: Renderer 事件简化** — 配合 M37 一起做
4. Prompt 组合 — 功能需求驱动时再做

## 原则

- **不是重写** — 渐进式重构，每步都保持可运行
- **向后兼容** — workspace 数据格式不变
- **品味 > 功能** — 先让现有功能优雅，再加新功能
- **理解 > 规则** — 架构设计也遵循这个原则：代码结构应该让新开发者一看就懂意图，不需要注释解释 why
