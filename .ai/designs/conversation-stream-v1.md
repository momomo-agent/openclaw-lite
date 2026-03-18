# ConversationStream — Phase 2 Architecture Design

## 核心思想

**对话流是唯一的真相源。** 所有参与者（orchestrator、delegate、coding-agent）都通过同一个 ConversationStream 读写消息。DB 操作隐藏在对话流内部。外部只看到 `append()` / `read()` / `update()`。

## 当前问题总结

| 问题 | 根因 |
|------|------|
| 消息顺序错乱 | finishChat 一次性写入，依赖 `__text__` hack 重建时序 |
| 群主文本和 delegate 文本混在一个 `fullText` 里 | stream-orchestrator 把所有 round 文本拼成一个字符串 |
| handleDone 替换时消息闪跳 | streaming 卡片是临时 ID，DB 是 row ID，整体替换 |
| 侧边栏 stale preview | listSessions 按 row ID 取最后一条，时序可能不对 |
| finishChat 逻辑复杂 | 要拆 toolSteps、分 segment、处理 delegate、处理 empty |

## 架构图

```
┌──────────────────────────────────────────────────────────┐
│                     User / Frontend                       │
│                                                          │
│  ChatView ←──── IPC events ←──── EventBus                │
│  (streaming cards with stable IDs)                       │
└──────────────────────────┬───────────────────────────────┘
                           │
                    IPC: loadSession / chat
                           │
┌──────────────────────────▼───────────────────────────────┐
│                   ConversationStream                      │
│                                                          │
│  The single API for all message operations:              │
│                                                          │
│  ┌─────────────────────────────────────────────────┐     │
│  │  append(msg)          → write + assign streamId  │     │
│  │  update(streamId, Δ)  → patch content/meta       │     │
│  │  finalize(streamId)   → mark as committed        │     │
│  │  read(n)              → last N messages          │     │
│  │  readForDelegate(n)   → curated view w/ labels   │     │
│  │  snapshot()           → full message list for UI  │     │
│  └─────────────────────────────────────────────────┘     │
│                                                          │
│  Internal: in-flight buffer + DB persistence             │
│  Every append() writes to DB immediately                 │
│  streamId is stable across streaming → DB                │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   DB Layer   │  │  In-Flight   │  │   Event      │   │
│  │  (SQLite)    │  │   Buffer     │  │   Emitter    │   │
│  │              │  │  (streaming  │  │  (notify UI  │   │
│  │  appendMsg   │  │   patches)   │  │   on change) │   │
│  │  updateMsg   │  │              │  │              │   │
│  │  loadMsgs    │  │              │  │              │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└──────────────────────────────────────────────────────────┘
           │                    │                │
    ┌──────▼──────┐     ┌──────▼──────┐   ┌─────▼──────┐
    │ Orchestrator │     │  Delegate   │   │  Coding    │
    │ (群主)       │     │  (Alice..)  │   │  Agent     │
    │              │     │             │   │            │
    │ stream.append│     │stream.append│   │stream.append
    │ stream.update│     │stream.update│   │            │
    │              │     │             │   │            │
    └──────────────┘     └─────────────┘   └────────────┘
```

## 时序图：群聊一次完整调度

```
User         ConversationStream      Orchestrator      Alice         Paul
  │                │                     │               │             │
  │─── "让他们各出对联" ──────────────────▶│               │             │
  │                │                     │               │             │
  │                │◀── append(user_msg) ─┤               │             │
  │                │    [streamId: u1]    │               │             │
  │                │    → DB write       │               │             │
  │                │                     │               │             │
  │                │    ┌────────────────┐│               │             │
  │                │    │ LLM thinking   ││               │             │
  │                │    └────────────────┘│               │             │
  │                │                     │               │             │
  │                │◀── append(orch_msg) ─┤               │             │
  │                │    [streamId: o1]    │               │             │
  │                │    content: "好，让   │               │             │
  │                │     Alice先来。"     │               │             │
  │                │    → DB write       │               │             │
  │                │                     │               │             │
  │◀─── event ─────│    (UI sees o1      │               │             │
  │    card added   │     immediately)    │               │             │
  │                │                     │               │             │
  │                │                     │── delegate ──▶│             │
  │                │                     │  (reads via   │             │
  │                │                     │  readForDel.) │             │
  │                │                     │               │             │
  │                │◀──────── append(alice_msg) ─────────┤             │
  │                │    [streamId: a1]    │               │             │
  │                │    sender: "Alice"   │               │             │
  │                │    → DB write       │               │             │
  │                │                     │               │             │
  │◀─── event ─────│    (UI sees a1)     │               │             │
  │                │                     │               │             │
  │                │                     │◀── return ────┤             │
  │                │                     │               │             │
  │                │                     │── delegate ──▶│             │
  │                │                     │               │      ┌──────┤
  │                │                     │               │      │reads │
  │                │                     │               │      │via   │
  │                │                     │               │      │readF.│
  │                │                     │               │      │sees  │
  │                │                     │               │      │Alice │
  │                │                     │               │      └──────┤
  │                │                     │               │             │
  │                │◀─────────────── append(paul_msg) ─────────────────┤
  │                │    [streamId: p1]    │               │             │
  │                │    sender: "Paul"    │               │             │
  │                │    → DB write       │               │             │
  │                │                     │               │             │
  │◀─── event ─────│    (UI sees p1)     │               │             │
  │                │                     │               │             │
  │                │                     │── stay_silent │             │
  │                │                     │               │             │
  │                │    ┌─ finalize ─┐   │               │             │
  │                │    │ mark all   │   │               │             │
  │                │    │ committed  │   │               │             │
  │                │    └────────────┘   │               │             │
  │                │                     │               │             │
  │◀── done event ─│  (no full replace— │               │             │
  │   UI keeps      │   IDs are stable)  │               │             │
  │   existing      │                    │               │             │
  │   cards         │                    │               │             │
```

### 关键设计决策

**1. 每条消息立即写 DB，一人一条**

不再在 finishChat 里 batch write。每个参与者说话时就写一条独立的 DB 记录：
- 群主说 "让 Alice 来" → 立即 `append()` → DB row
- Alice 回复 → 立即 `append()` → DB row
- Paul 回复 → 立即 `append()` → DB row

好处：不需要 `__text__` hack。不需要 finishChat 里复杂的 segment 拆分。

**2. 自生成 ID — 前端后端共用同一个 ID**

不依赖 DB row ID。`append()` 调用前先生成一个 `msgId`（格式：`msg-{timestamp}-{random}`），这个 ID：
- 写入 DB 时作为 `msg_id` 列存储
- 通过 streaming 事件传给前端
- 前端 streaming card 直接用这个 ID
- handleDone 不需要全量替换 — ID 已经 stable

DB schema 变更：
```sql
ALTER TABLE messages ADD COLUMN msg_id TEXT;
CREATE UNIQUE INDEX idx_messages_msg_id ON messages(session_id, msg_id);
```
保留 `id INTEGER PRIMARY KEY AUTOINCREMENT` 做排序（`ORDER BY id`），加 `msg_id TEXT` 做身份标识。

**3. Streaming 用 update() 而不是 append()**

orchestrator/delegate streaming 时：
1. `append()` → 创建消息记录（content: '', status: 'streaming'）
2. 每个 token → `update(streamId, { content: accumulated })` → 只更新内存 buffer
3. 完成 → `finalize(streamId)` → flush 到 DB

这样 streaming 期间不频繁写 DB，但消息的**位置**（DB row ID）在第一步就确定了。

**4. readForDelegate() 包含一切**

delegate 读上下文时，ConversationStream 返回**所有已 append 的消息**，包括还在 streaming 的。不需要手动拼 `_pendingDelegateMessages`。

**5. finishChat 变成 finalize()**

finishChat 不再写任何消息。它只做：
- `finalize()` 所有 in-flight 消息（flush pending updates to DB）
- 发 `chat-done` event
- 清理状态

## ConversationStream API

```javascript
class ConversationStream {
  constructor(sessionId, dbPath, eventBus) {
    this._sessionId = sessionId
    this._dbPath = dbPath
    this._eventBus = eventBus
    this._inflight = new Map()  // streamId → { content, meta, dirty }
  }

  /**
   * Append a new message. Writes to DB immediately.
   * Returns streamId (= DB row ID) for subsequent updates.
   */
  append({ role, content, sender, senderWorkspaceId, toolSteps, ...meta }) → streamId

  /**
   * Update an in-flight message (streaming tokens).
   * Buffers in memory — does NOT write to DB on every token.
   */
  update(streamId, { content?, toolSteps?, ...meta? })

  /**
   * Finalize a message — flush buffered updates to DB.
   * Called when streaming for this message is complete.
   */
  finalize(streamId)

  /**
   * Finalize ALL in-flight messages. Called at end of chat turn.
   */
  finalizeAll()

  /**
   * Read recent messages for orchestrator context.
   * Returns DB messages + in-flight messages, in order.
   */
  read(limit = 50) → Message[]

  /**
   * Read curated context for a delegate participant.
   * Labels user messages as [User to group], includes in-flight messages.
   */
  readForDelegate(ownerName, delegateName, limit = 20) → Message[]

  /**
   * Get full snapshot for UI (loadSession replacement).
   */
  snapshot() → Message[]
}
```

## 文件变更计划

### 新增

| 文件 | 职责 |
|------|------|
| `core/conversation-stream.js` | ConversationStream class |

### 修改

| 文件 | 变更 |
|------|------|
| `main.js` | `persistUserMessage` → `stream.append()`; `finishChat` → `stream.finalizeAll()` + event; 不再直接调 `sessionStore.appendMessage` |
| `core/delegate.js` | `buildDelegateContext()` → `stream.readForDelegate()`; delegate 回复 → `stream.append()` + `stream.update()` |
| `core/stream-orchestrator.js` | 移除 `__text__` hack; 每个 round 的 text 通过 `stream.append()` + `stream.update()` 实时写入 |
| `session-store.js` | 新增 `updateMessageContent()` (用于 finalize flush) |
| `src/hooks/useChatEvents.ts` | `handleDone` 不再全量替换; 用 stable streamId 匹配 |

### 移除的 hack

| Hack | 替代 |
|------|------|
| `__text__` markers in flowSteps | 每段 text 是独立的 `append()` |
| `_pendingDelegateMessages` Map | `stream.readForDelegate()` 自然包含 |
| `finishChat` segment splitting | 不需要 — 每条消息已独立 |
| `handleDone` full message replace | stable streamId — 只 finalize 状态 |
| `saveText` / `fullText` 拼接 | 每个 segment 独立持久化 |

## 迁移策略

### Step 1: ConversationStream 骨架 + appendMessage 代理
- 创建 `core/conversation-stream.js`
- 先做 thin wrapper over `sessionStore` — `append()` 调 `sessionStore.appendMessage()`
- 添加 `_inflight` buffer 和 `update()` / `finalize()`

### Step 2: 接入 orchestrator
- `stream-orchestrator.js` 每个 round 开始时 `stream.append()` 创建消息
- streaming tokens 通过 `stream.update()` 更新
- 移除 `__text__` markers 和 `fullText` 拼接

### Step 3: 接入 delegate
- `delegate.js` 用 `stream.append()` 创建 delegate 消息
- `readForDelegate()` 替换 `buildDelegateContext()`
- 移除 `_pendingDelegateMessages`

### Step 4: 简化 finishChat → finalizeAll
- `finishChat` 只调 `stream.finalizeAll()` + dispatch done event
- 移除所有 segment splitting 逻辑

### Step 5: 前端 stable ID
- 事件里带上 `streamId`
- `handleDone` 不再全量替换

## 风险评估

1. **渐进迁移**: 每个 Step 独立可测，不需要一次全改
2. **向后兼容**: ConversationStream 先做 thin wrapper，不破坏现有行为
3. **性能**: `update()` 不写 DB，`finalize()` 才写 — 比之前的 append-per-token 更高效
4. **Crash safety**: `append()` 立即写 DB 确保消息位置。streaming content 丢失可接受（用户重试即可）
