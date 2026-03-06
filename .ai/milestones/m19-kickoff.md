# M19: 主/轻量 Agent 分层

## 一句话目标

从"所有 agent 都是 agents/ 目录下的 JSON 文件"升级为"主 Agent 是 workspace 灵魂 + 轻量 Agent 是 session 内临时参与者"。

## 为什么做

当前 agent 系统（M16）的问题：

1. **所有 agent 同质** — agents/ 目录下的 JSON 文件，没有主次之分。但实际上 SOUL.md 才是 workspace 的灵魂，agents/ 里的是客人。
2. **agent 必须预置** — 用户或 AI 必须先在 agents/ 创建文件，才能在 session 里使用。不能随时创建临时角色。
3. **生命周期不对** — agents/ 里的 agent 是全局的，但大多数多 agent 场景只需要 session 级的临时角色。

## 目标模型

```
Workspace
├── 主 Agent（SOUL.md + USER.md + 记忆 + 工具）
│   - 不在 members 列表里，是默认回复者
│   - workspace 级别，永远在
│   - 多 agent session 里自然成为 coordinator
└── Session
    ├── 轻量 Agent A（名称 + 角色描述）— 平等参与者
    ├── 轻量 Agent B（名称 + 角色描述）— 平等参与者
    └── 人
```

- **主 Agent** 不需要改造 — 当前 SOUL.md → buildSystemPrompt() 的逻辑已经是主 Agent
- **轻量 Agent** 是新概念 — session 内创建，存在 session 数据里，不持久化到 agents/
- **agents/ 保留为模板库** — 常用角色可以存为模板，快速拉进 session

## 不做什么

- ❌ 不做 agent 能力限制（所有 agent 共享同一套工具）
- ❌ 不做 agent 模型切换引擎（先不区分 agent 用什么 model）
- ❌ 不做工具层抽象（B037，下个里程碑）
- ❌ 不做 CC 集成（B038，依赖 B037）
- ❌ 不改变数据格式兼容性

## Features

| ID | 名称 | 说明 |
|----|------|------|
| F061 | 轻量 Agent 数据模型 | SQLite session_agents 表：session_id, name, role, created_at。agent 只在 session 内存活。 |
| F062 | 轻量 Agent CRUD | 创建/删除轻量 agent 的 IPC + session-store 函数。主 agent 或用户都可以创建。 |
| F063 | 主 Agent 身份确立 | 去掉对 agents/ JSON 的依赖。无 agent 指定时默认用主 Agent（SOUL.md），不再 fallback 到 agents/ 里的第一个。 |
| F064 | 轻量 Agent 对话路由 | chat handler 支持轻量 agent：加载 role 描述注入 system prompt，@mention 路由到轻量 agent。 |
| F065 | 轻量 Agent UI | Members 面板支持创建/查看/删除轻量 agent。区分"从模板添加"和"创建临时角色"。 |
| F066 | agent 工具升级 | send_message、task 系统适配轻量 agent。轻量 agent 也能参与 auto-rotation。 |
| F067 | 集成验证 | 主 Agent 单聊 + 轻量 Agent 群聊场景全部正常。 |

## 实施顺序

```
F061 (数据模型) → F062 (CRUD) → F063 (主 Agent) → F064 (路由) → F065 (UI) → F066 (工具) → F067 (验证)
```

逐步迁移，每步都能运行。向后兼容现有单 agent 对话。

## 验证标准

每个 Feature 完成后：
1. `node --check main.js` 通过
2. `npm start` 能正常启动
3. 现有单 agent 对话不受影响

F067 完成后追加：
4. 创建轻量 agent，@mention 能路由到它
5. 轻量 agent 能用 send_message 和 task 工具
6. 删除轻量 agent 后，session 回到单 agent 模式
7. agents/ 里的模板能快速拉进 session 创建为轻量 agent

## 红线

- 现有 agents/ JSON 继续工作（作为模板库）
- 单 agent 对话体验完全不变
- 不引入新的外部依赖
