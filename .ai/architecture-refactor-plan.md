# Paw 架构问题诊断 & 重构方案

**分析者:** Kiro  
**日期:** 2026-03-02  
**目的:** 诊断 Paw 当前架构问题，设计理想架构

---

## 一、当前架构问题诊断

### 问题 1: 单体 Electron 架构导致耦合

**现状:**
```
Electron Main (main.js)
├── Config Loading
├── System Prompt Building
├── LLM Streaming
├── Tool Execution
├── Heartbeat Management
├── Tray Icon
├── Notification
└── Session Store (SQLite)
    ↕ IPC
Electron Renderer (HTML/CSS/JS)
├── Chat UI
├── Sidebar
├── Settings
└── File Handlers
```

**问题:**
- main.js 超过 1000 行，包含所有逻辑
- 无法独立测试各模块
- 修改一处容易影响其他地方
- 难以复用到其他平台（iOS、Web）

**例子:**
```javascript
// main.js 混合了太多职责
async function streamAnthropic(messages, systemPrompt, config, win, requestId) {
  // 1. 构造请求
  // 2. 调用 API
  // 3. 解析响应
  // 4. 执行工具
  // 5. 更新 UI
  // 6. 保存到数据库
  // 7. 更新 tray 图标
  // 8. 发送通知
}
```

---

### 问题 2: 记忆系统一致性弱

**现状:**
```
Window 1 (Process A)
  ↓ 写入
memory/YYYY-MM-DD.md
  ↑ 读取
Window 2 (Process B)
```

**问题:**
- 多进程并发写入冲突
- 文件监听延迟（100-500ms）
- 无事务保证
- 一致性无法保证

**场景:**
```
Window 1: 写入 memory/2026-03-02.md
Window 2: 同时读取 memory/2026-03-02.md
结果: Window 2 可能读到旧数据或损坏数据
```

---

### 问题 3: 工具系统不够灵活

**现状:**
```javascript
// main.js 中硬编码工具
switch (name) {
  case 'web_fetch': return await webFetch(input);
  case 'file_read': return await fileRead(input);
  case 'shell_exec': return await shellExec(input);
  // ... 更多工具
}
```

**问题:**
- 添加新工具需要修改 main.js
- 工具定义分散在多个地方
- 无法动态加载工具
- 无法禁用某些工具

---

### 问题 4: 多窗口状态管理混乱

**现状:**
```javascript
let mainWindow = null;
let _activeRequestId = null;
let _trayStatusText = '空闲待命中';

// 多个全局变量，难以追踪状态
```

**问题:**
- 全局变量难以管理
- 多窗口时状态冲突
- 无法独立控制每个窗口
- 调试困难

---

### 问题 5: 无法扩展到其他平台

**现状:**
- 所有逻辑耦合在 Electron Main
- 无法复用到 iOS、Web、CLI
- 每个平台都要重写

**问题:**
- 代码重复
- 维护成本高
- 功能不一致

---

## 二、理想架构设计

### 架构目标

1. **关注点分离** — 每个模块只做一件事
2. **可测试** — 各模块独立测试
3. **可复用** — 核心逻辑可用于多个平台
4. **可扩展** — 添加新功能不影响现有代码
5. **可维护** — 代码清晰，易于理解

---

### 分层架构设计

```
┌─────────────────────────────────────────────────────────┐
│ Presentation Layer (UI)                                 │
├─────────────────────────────────────────────────────────┤
│ Electron Renderer (HTML/CSS/JS)                         │
│ iOS (SwiftUI)                                           │
│ Web (React/Vue)                                         │
│ CLI (Node.js)                                           │
└─────────────────────────────────────────────────────────┘
                        ↕ IPC / HTTP / WebSocket
┌─────────────────────────────────────────────────────────┐
│ Orchestration Layer (Business Logic)                    │
├─────────────────────────────────────────────────────────┤
│ Session Manager                                         │
│ Prompt Builder                                          │
│ Tool Router                                             │
│ Memory Manager                                          │
│ Heartbeat Scheduler                                     │
└─────────────────────────────────────────────────────────┘
                        ↕
┌─────────────────────────────────────────────────────────┐
│ Provider Layer (Model Integration)                      │
├─────────────────────────────────────────────────────────┤
│ Anthropic Provider                                      │
│ OpenAI Provider                                         │
│ Model Router                                            │
└─────────────────────────────────────────────────────────┘
                        ↕
┌─────────────────────────────────────────────────────────┐
│ Tool Layer (Execution)                                  │
├─────────────────────────────────────────────────────────┤
│ Tool Registry                                           │
│ Tool Executor                                           │
│ Tool Approval                                           │
└─────────────────────────────────────────────────────────┘
                        ↕
┌─────────────────────────────────────────────────────────┐
│ Storage Layer (Persistence)                             │
├─────────────────────────────────────────────────────────┤
│ Session Store (SQLite)                                  │
│ Memory Store (SQLite)                                   │
│ Config Store (JSON)                                     │
└─────────────────────────────────────────────────────────┘
```

---

### 核心模块设计

#### 1. Session Manager

**职责:**
- 创建/加载/保存 session
- 管理 session 状态
- 处理多窗口 session

**接口:**
```typescript
interface SessionManager {
  createSession(workspaceDir: string): Promise<Session>;
  loadSession(sessionId: string): Promise<Session>;
  saveSession(session: Session): Promise<void>;
  listSessions(workspaceDir: string): Promise<Session[]>;
  deleteSession(sessionId: string): Promise<void>;
}
```

---

#### 2. Prompt Builder

**职责:**
- 加载 SOUL.md / MEMORY.md
- 加载 skills/
- 构造 system prompt
- 管理 context 大小

**接口:**
```typescript
interface PromptBuilder {
  buildSystemPrompt(session: Session): Promise<string>;
  buildMessages(session: Session): Promise<Message[]>;
  estimateTokens(prompt: string): number;
}
```

---

#### 3. Tool Registry

**职责:**
- 注册工具
- 查找工具
- 验证工具参数
- 生成工具描述

**接口:**
```typescript
interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | null;
  getAll(): Tool[];
  getSchema(): ToolSchema[];
  validate(name: string, input: unknown): boolean;
}
```

---

#### 4. Tool Executor

**职责:**
- 执行工具
- 处理错误
- 记录执行历史
- 支持重试

**接口:**
```typescript
interface ToolExecutor {
  execute(name: string, input: unknown): Promise<string>;
  executeWithApproval(name: string, input: unknown): Promise<string>;
  getHistory(): ToolExecution[];
}
```

---

#### 5. Memory Manager

**职责:**
- 跨 session 记忆
- 实时同步
- 一致性保证
- 搜索和检索

**接口:**
```typescript
interface MemoryManager {
  write(key: string, value: string): Promise<void>;
  read(key: string): Promise<string | null>;
  search(query: string): Promise<MemoryEntry[]>;
  sync(): Promise<void>;
  watch(callback: (changes: MemoryChange[]) => void): void;
}
```

---

#### 6. Model Router

**职责:**
- 选择模型提供商
- 管理 API key
- 处理流式响应
- 错误重试

**接口:**
```typescript
interface ModelRouter {
  selectProvider(config: Config): Provider;
  stream(messages: Message[], system: string): AsyncIterable<string>;
  parseResponse(raw: string): ToolCall | TextResponse;
}
```

---

### 数据流设计

```
User Input (Renderer)
    ↓
Session Manager (加载 session)
    ↓
Prompt Builder (构造 prompt)
    ↓
Model Router (选择提供商)
    ↓
Provider (调用 API)
    ↓
Tool Router (检测工具调用)
    ↓
Tool Executor (执行工具)
    ↓
Memory Manager (保存结果)
    ↓
Session Store (持久化)
    ↓
Renderer (显示结果)
```

---

## 三、重构路线图

### Phase 1: 基础设施 (1-2 周)

**目标:** 抽象核心模块，保持现有功能不变

**任务:**
1. 创建 `src/core/` 目录
2. 实现 SessionManager
3. 实现 PromptBuilder
4. 实现 ToolRegistry
5. 实现 MemoryManager

**验证:**
- 所有现有功能仍然正常
- 单元测试覆盖 80%+

---

### Phase 2: 模块化 (2-3 周)

**目标:** 将 main.js 逻辑迁移到各模块

**任务:**
1. 提取 Tool Executor
2. 提取 Model Router
3. 提取 Heartbeat Scheduler
4. 提取 Notification Manager

**验证:**
- main.js 行数减少 50%+
- 功能完全相同

---

### Phase 3: 通信层 (1-2 周)

**目标:** 将 Orchestrator 独立为后端服务

**任务:**
1. 创建 HTTP API 层
2. 实现 IPC 通信
3. 支持多窗口通信
4. 实现消息队列

**验证:**
- 多窗口独立运行
- 无状态冲突

---

### Phase 4: 存储层升级 (1-2 周)

**目标:** 改进记忆系统一致性

**任务:**
1. 升级 SQLite 为单进程模式
2. 实现事务支持
3. 实现 WAL 模式
4. 实现实时同步

**验证:**
- 并发写入无冲突
- 一致性保证

---

### Phase 5: 多平台支持 (2-4 周)

**目标:** 支持 iOS、Web、CLI

**任务:**
1. 提取 Orchestrator 为独立服务
2. 实现 HTTP API
3. iOS 客户端连接 Orchestrator
4. Web 客户端连接 Orchestrator

**验证:**
- 三个平台功能一致
- 数据同步正常

---

## 四、具体实现建议

### 目录结构

```
paw/
├── src/
│   ├── core/
│   │   ├── session-manager.ts
│   │   ├── prompt-builder.ts
│   │   ├── tool-registry.ts
│   │   ├── tool-executor.ts
│   │   ├── memory-manager.ts
│   │   ├── model-router.ts
│   │   └── types.ts
│   ├── providers/
│   │   ├── anthropic.ts
│   │   ├── openai.ts
│   │   └── base.ts
│   ├── tools/
│   │   ├── web-fetch.ts
│   │   ├── file-ops.ts
│   │   ├── shell-exec.ts
│   │   └── index.ts
│   ├── storage/
│   │   ├── session-store.ts
│   │   ├── memory-store.ts
│   │   └── config-store.ts
│   ├── electron/
│   │   ├── main.ts (精简版)
│   │   ├── preload.ts
│   │   └── ipc-handlers.ts
│   └── renderer/
│       ├── app.js
│       ├── ui/
│       └── styles/
├── tests/
│   ├── core/
│   ├── providers/
│   └── tools/
└── package.json
```

---

### 核心模块示例

#### SessionManager

```typescript
// src/core/session-manager.ts
export class SessionManager {
  constructor(private store: SessionStore) {}
  
  async createSession(workspaceDir: string): Promise<Session> {
    const session: Session = {
      id: generateId(),
      workspaceDir,
      createdAt: new Date(),
      messages: [],
      config: {},
      state: 'idle'
    };
    
    await this.store.save(session);
    return session;
  }
  
  async loadSession(sessionId: string): Promise<Session> {
    const session = await this.store.load(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    return session;
  }
  
  async saveSession(session: Session): Promise<void> {
    await this.store.save(session);
  }
}
```

---

#### ToolRegistry

```typescript
// src/core/tool-registry.ts
export class ToolRegistry {
  private tools = new Map<string, Tool>();
  
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }
  
  get(name: string): Tool | null {
    return this.tools.get(name) || null;
  }
  
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }
  
  getSchema(): ToolSchema[] {
    return this.getAll().map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    }));
  }
}
```

---

#### MemoryManager

```typescript
// src/core/memory-manager.ts
export class MemoryManager {
  constructor(private store: MemoryStore) {}
  
  async write(key: string, value: string): Promise<void> {
    await this.store.write(key, value);
    this.notifyWatchers({ type: 'write', key, value });
  }
  
  async read(key: string): Promise<string | null> {
    return await this.store.read(key);
  }
  
  async search(query: string): Promise<MemoryEntry[]> {
    return await this.store.search(query);
  }
  
  watch(callback: (changes: MemoryChange[]) => void): void {
    this.watchers.push(callback);
  }
  
  private notifyWatchers(change: MemoryChange): void {
    this.watchers.forEach(cb => cb([change]));
  }
}
```

---

## 五、迁移策略

### 不破坏现有功能

**原则:**
- 新模块与旧代码并存
- 逐步迁移，不一次性重写
- 每个模块独立测试
- 功能完全相同后才替换

**步骤:**
1. 创建新模块（不删除旧代码）
2. 新模块通过单元测试
3. 在 main.js 中并行调用新模块
4. 验证结果一致
5. 删除旧代码

---

### 测试策略

**单元测试:**
```typescript
describe('SessionManager', () => {
  it('should create a new session', async () => {
    const manager = new SessionManager(mockStore);
    const session = await manager.createSession('/path');
    expect(session.id).toBeDefined();
  });
});
```

**集成测试:**
```typescript
describe('Full Flow', () => {
  it('should handle a complete chat interaction', async () => {
    const session = await sessionManager.createSession('/path');
    const prompt = await promptBuilder.buildSystemPrompt(session);
    const response = await modelRouter.stream(messages, prompt);
    // ...
  });
});
```

---

## 六、成本-收益分析

### 成本

- **开发时间:** 4-6 周
- **测试时间:** 2-3 周
- **文档时间:** 1 周
- **总计:** 7-10 周

### 收益

- **代码质量:** 可维护性 +50%
- **测试覆盖:** 从 0% → 80%+
- **扩展性:** 支持多平台
- **性能:** 记忆系统一致性 +100%
- **开发速度:** 新功能开发 +30%

### ROI

**短期 (3 个月):**
- 修复 bug 速度 +50%
- 新功能开发 +30%

**中期 (6 个月):**
- 支持 iOS 客户端
- 支持 Web 客户端
- 代码复用率 +70%

**长期 (12 个月):**
- 多平台统一体验
- 维护成本 -40%
- 用户满意度 +30%

---

## 七、风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 迁移过程中引入 bug | 高 | 中 | 充分的单元测试 + 集成测试 |
| 性能下降 | 中 | 中 | 性能基准测试 + 优化 |
| 用户困惑 | 低 | 低 | 清晰的版本说明 |
| 时间超期 | 中 | 中 | 分阶段交付 + 每周评审 |

---

## 八、决策建议

**现在应该做什么？**

### 选项 A: 立即重构（激进）
- 优点: 快速获得收益
- 缺点: 风险高，可能引入 bug
- 建议: 不推荐

### 选项 B: 分阶段重构（稳健）
- 优点: 风险低，可控
- 缺点: 时间长
- 建议: **推荐**

### 选项 C: 不重构（保守）
- 优点: 无风险
- 缺点: 技术债务累积
- 建议: 不推荐

---

**我的建议：选择 B（分阶段重构）**

**理由:**
1. Paw 已经有用户，不能破坏现有功能
2. 分阶段可以控制风险
3. 每个阶段都能交付价值
4. 为多平台支持做准备

**立即行动:**
1. 评审本方案
2. 制定详细计划
3. 启动 Phase 1（基础设施）
4. 每周评审进度

---

## 九、总结

**Paw 当前架构问题:**
1. 单体耦合，难以维护
2. 记忆系统一致性弱
3. 工具系统不够灵活
4. 无法扩展到其他平台
5. 多窗口状态管理混乱

**理想架构:**
- 分层设计（Presentation → Orchestration → Provider → Tool → Storage）
- 模块化（SessionManager、PromptBuilder、ToolRegistry 等）
- 可测试（单元测试 + 集成测试）
- 可复用（支持多平台）
- 可维护（清晰的职责边界）

**重构路线:**
- Phase 1: 基础设施 (1-2 周)
- Phase 2: 模块化 (2-3 周)
- Phase 3: 通信层 (1-2 周)
- Phase 4: 存储层 (1-2 周)
- Phase 5: 多平台 (2-4 周)

**总投入:** 7-10 周

**预期收益:** 可维护性 +50%，支持多平台，技术债务清零
