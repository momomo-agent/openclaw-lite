# M19 Requirements — 主/轻量 Agent 分层

## F061: 轻量 Agent 数据模型

### 背景
当前所有 agent 都存在 agents/*.json，是 workspace 级别。需要一个 session 级别的轻量 agent 存储。

### 需求
- [ ] session-store.js 新增 `session_agents` 表：
  ```sql
  CREATE TABLE IF NOT EXISTS session_agents (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  )
  ```
- [ ] 新增函数：`createSessionAgent(clawDir, sessionId, { name, role })`
- [ ] 新增函数：`listSessionAgents(clawDir, sessionId)`
- [ ] 新增函数：`deleteSessionAgent(clawDir, agentId)`
- [ ] 新增函数：`getSessionAgent(clawDir, agentId)`
- [ ] agent id 生成：`a` + timestamp base36 + random

### 设计约束
- session_agents 随 session 删除自动级联删除
- 不改动现有 sessions/messages/tasks 表

---

## F062: 轻量 Agent CRUD

### 背景
需要 IPC 通道让 renderer 和 LLM 工具都能创建/管理轻量 agent。

### 需求
- [ ] IPC handler `session-create-agent`：创建轻量 agent，返回 agent 对象
- [ ] IPC handler `session-list-agents`：列出 session 内所有轻量 agent
- [ ] IPC handler `session-delete-agent`：删除轻量 agent
- [ ] preload.js 暴露对应 API
- [ ] 新增 LLM 工具 `create_agent`：AI 可以在当前 session 创建轻量 agent
  - 参数：name (string), role (string)
  - 返回创建的 agent 对象
- [ ] 新增 LLM 工具 `remove_agent`：AI 可以移除 session 内轻量 agent
  - 参数：name (string)

### 设计约束
- agents/ 目录的 CRUD（agent-create, agent-save 等）保持不变，作为模板库
- 轻量 agent 名称在同 session 内唯一

---

## F063: 主 Agent 身份确立

### 背景
当前 chat handler 的逻辑：有 agentId 就 loadAgent（从 agents/ 加载），没有就不加 agent soul。需要明确"无指定 = 主 Agent"的概念。

### 需求
- [ ] chat handler：当 agentId 为空或 null 时，使用主 Agent 身份（SOUL.md + USER.md，已有逻辑，无需改动）
- [ ] chat handler：当 agentId 是轻量 agent ID（`a` 开头）时，从 session_agents 加载 role
- [ ] chat handler：当 agentId 是 agents/ 模板 ID 时，仍从 agents/ 加载（向后兼容）
- [ ] prompt 注入：轻量 agent 的 role 描述作为 system prompt 前缀，格式：`## Your Role\n{role}\n\n---\n\n`
- [ ] currentAgentName：轻量 agent 设为其 name，主 agent 设为 null（保持现有行为）

### 设计约束
- 主 Agent 不出现在 members 列表里
- 轻量 agent 的 role 描述替代 agent.soul，不叠加

---

## F064: 轻量 Agent 对话路由

### 背景
当前 @mention 路由通过 agentId 查找 agents/ 目录。需要扩展支持轻量 agent。

### 需求
- [ ] renderer 发消息时：@mention 先查 session 内轻量 agent，再查 agents/ 模板
- [ ] members 面板里的成员列表：合并显示轻量 agent + 从模板添加的 agent
- [ ] session members 数据结构调整：从 `['agent-id-1', 'agent-id-2']` 变为能区分轻量和模板
- [ ] Teammate Context 注入（F046）：同时包含轻量 agent 的消息

### 设计约束
- session.members 兼容旧格式：纯字符串 ID 视为模板 agent（向后兼容）
- 轻量 agent 的 ID 以 `a` 开头，模板 agent ID 不以 `a` 开头，用此区分

---

## F065: 轻量 Agent UI

### 背景
Members 面板当前只能从 agents/ 目录选择预定义 agent。需要支持创建临时角色。

### 需求
- [ ] Members 面板新增"创建角色"按钮
- [ ] 点击弹出简单表单：名称 + 角色描述（一两句话）
- [ ] 创建后立即加入 session members
- [ ] 成员列表区分轻量 agent（临时，显示删除按钮）和模板 agent
- [ ] 从模板创建：选择 agents/ 里的模板 → 用模板的 name 和 soul 创建轻量 agent
- [ ] 删除轻量 agent：从 session 移除 + 从数据库删除

### 设计约束
- UI 简洁，不喧宾夺主
- 角色描述文本框限制 500 字符
- 保持现有 Members 面板的整体布局

---

## F066: Agent 工具适配

### 背景
send_message 和 task 系统当前依赖 agents/ 目录查找 agent。需要适配轻量 agent。

### 需求
- [ ] send_message：查找目标时先查 session 内轻量 agent，再查 agents/
- [ ] task 工具：assignee 字段支持轻量 agent 名称
- [ ] auto-rotation：轻量 agent 也能被自动触发
- [ ] create_agent / remove_agent 工具：通知 renderer 刷新成员列表

### 设计约束
- 不改变 task 数据结构
- send_message 的防循环机制保持不变

---

## F067: 集成验证

### 验证场景
1. 单 agent（主 Agent）对话：和 M18 完全一致
2. 用户手动创建轻量 agent，@mention 对话
3. AI 通过 create_agent 工具创建轻量 agent
4. 轻量 agent 之间用 send_message 通信
5. 轻量 agent 参与 task auto-rotation
6. 删除轻量 agent，session 回到单 agent
7. 从 agents/ 模板快速创建轻量 agent
8. 重启 app，session 内轻量 agent 仍在（SQLite 持久化）
