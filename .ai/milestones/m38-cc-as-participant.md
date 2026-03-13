# M38 — Coding Agent 作为对话参与者

## 目标

把 Coding Agent（Claude Code / Codex / Gemini CLI / Kiro）从「工具面板」升级为「对话参与者」。用户可以直接跟 CC 对话，也可以把 CC 拉进群聊由群主调度。

## 背景

当前 CC 是一个工具——调用 `claude_code` 工具后，输出在一个 `<pre>` 面板里显示。这不对。CC 应该是一个人，像其他 workspace agent 一样有气泡、有头像、可以对话。

vision.md 已经定义了这个方向：
> **Coding Agent（项目文件夹）** — 专注写代码的执行器
> 选择 coding agent 类型 + 项目文件夹 → 直接对话

## 设计决策

1. **CC 是独立 participant，不是 workspace 的能力** — CC 不需要 SOUL.md、MEMORY.md、skills。它就是一个会写代码的人，身份只有：名字、头像、引擎类型、工作目录
2. **无 Stop 按钮** — coding agent 跑完自然结束，中途打断代码写一半更危险
3. **Session 持久化** — 每个 Paw session 对应一个 CC session（acpx），可续接
4. **复用 delegate 事件链** — CC 输出通过 `delegate-start/token/end` 渲染，前端零改动
5. **两个入口** — 新建对话 + 成员管理，统一体验

---

## Feature 列表

### F255: Coding Agent Participant 数据模型

**目标**：participant 支持 coding-agent 类型

**改动**：
- `session-store.js` — `participants` 列支持两种格式：
  - 旧格式（向后兼容）：`"ws-abc"` → type=workspace
  - 新格式：`"ca:<engine>:<workdir>"` — 如 `"ca:claude:/Users/kenefe/projects/myapp"`
- `getSessionParticipants` 返回统一结构：`{ type, id, engine?, workdir?, name? }`
- `coding-agent-registry.js` — 添加 `get(id)` 方法
- 新建 session 时如果 participant 是 coding-agent，自动设置 session mode 为 `coding`

**验证**：创建一个包含 CA participant 的 session，重启后数据不丢失

### F256: 消息路由支持 Coding Agent

**目标**：发消息给 CC participant 时，走 acpx 而不是内部 LLM

**改动**：
- `main.js` 的 `ipcMain.handle('chat')` 分支：
  - 检测 session 的 sole participant 或 @mention 的 target 是否为 coding-agent
  - 如果是 → 调用 `coding-agents.run()` 而不是 `streamAnthropic/streamOpenAI`
  - acpx 的 `onOutput` 回调发 `chat-token`（普通消息）或 `chat-delegate-token`（群聊）
  - 完成后发 `chat-done` 或 `chat-delegate-end`
- `handleDelegateTo` — 如果 target participant 是 coding-agent，走 acpx 路径
- CC session 自动续接：`sessionCCSessions` Map 维持 pawSessionId → acpx session name

**验证**：1v1 CC 对话能收发消息；群聊中 @CC 能触发 CC 响应

### F257: 新建对话 — Coding Agent 入口

**目标**：NewChatSelector 里点击 CC 选项 → 选文件夹 → 创建对话

**改动**：
- `NewChatSelector.tsx` 的「编码助手」区块改造：
  - 当前：从 `codingAgentsList` 读取已注册的 CA，点击用 `mode: 'coding'`
  - 改后：列出已注册的 CA + 底部「添加 Coding Agent」按钮
  - 点击已注册的 CA → 直接创建对话
  - 点击「添加」→ 选引擎（claude/codex/gemini/kiro）→ 选文件夹 → 注册 + 创建对话
- 新增 IPC: `select-directory` — 弹出文件夹选择器
- CA 显示：引擎 icon + 项目文件夹名 + 路径

**验证**：从 NewChatSelector 创建 CC 对话，能正常发消息和收到回复

### F258: 成员管理 — 添加 Coding Agent

**目标**：MembersPanel 里添加成员时可以选 Coding Agent

**改动**：
- `MembersPanel.tsx` — 添加成员列表里增加 CA 选项
  - 已注册的 CA 列表 + 「添加新 Coding Agent」
  - 点击已注册 CA → 调用 `addParticipant(sessionId, caId)` 加入群聊
  - 点击添加新 → 选引擎 → 选文件夹 → 注册 + 加入
- 成员列表里 CA 显示引擎 icon 和工作目录

**验证**：群聊中添加 CC 成员，群主能通过 delegate_to 调度 CC

### F259: 清理旧 CC 面板

**目标**：删除所有 cc-status / cc-output 相关代码

**删除**：
- `ChatView.tsx` — 删除 `ccOutput` state、`handleCcStatus`、`handleCcOutput`、CC Output Panel JSX
- `preload.js` — 删除 `onCcStatus`、`onCcOutput`、`ccStop`
- `main.js` — 删除 `cc-status`、`cc-output` 的 eventBus 转发
- `tools/claude-code.js` — 重写：不再发 cc-status/cc-output，改为通过 coding-agents.run() 的 onOutput → eventBus delegate 事件

**验证**：`grep -r "cc-status\|cc-output\|ccStop\|ccOutput\|ccIsRunning" src/ preload.js` 返回空

---

## 执行顺序

```
F255 (数据模型) → F256 (消息路由) → F257 (新建对话入口) → F258 (成员管理入口) → F259 (清理)
```

F255→F256 是后端核心，串行。F257/F258 是前端入口，依赖 F255 但互相独立。F259 最后做。

## 依赖

```
F255 ──→ F256 ──→ F259
  │
  ├──→ F257
  └──→ F258
```

## Gate 标准

- [ ] 1v1 CC 对话：从 NewChatSelector 创建 → 发消息 → CC 气泡出现 → 内容正确
- [ ] 群聊 CC：添加 CC 成员 → delegate_to CC → CC 气泡出现
- [ ] Session 续接：关闭对话重新打开 → 发消息 → CC 记得上文
- [ ] 向后兼容：旧 session（纯 workspace participants）正常工作
- [ ] 无残留：`grep cc-status/cc-output/ccStop` 返回空
- [ ] `node --check main.js` 通过
- [ ] `npx tsc --noEmit` 通过（允许 unused var 警告）
- [ ] `npx vite build` 通过

## 不做

- CC 的 system prompt / 记忆 / 人格 — 它就是一个代码执行器
- CC 的 thinking block 解析 — acpx 输出是纯文本，直接渲染
- Context 注入选项（vision.md 提到的「注入某个 workspace 的 SOUL.md」）— 后续迭代
- 多引擎并行（一个 session 里多个不同引擎的 CC）— 后续
