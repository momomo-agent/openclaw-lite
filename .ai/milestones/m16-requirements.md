# M16 Requirements — Agent Team

## F045: 共享 Task List

### 背景
Claude Code agent teams 的核心是共享任务清单：任务有状态（pending/in-progress/done）、有依赖关系、有 claim 锁。Paw 当前没有任何任务管理概念。

### 需求
- [ ] 数据模型：每个 session 有一个 tasks 数组，每个 task 有 id/title/status/assignee/dependsOn/createdBy
- [ ] 状态机：pending → in-progress → done（只能前进，不能回退）
- [ ] 依赖：task.dependsOn 是 taskId 数组，依赖未完成时不能 claim
- [ ] 新增 LLM 工具 `task_create`：创建任务（title, dependsOn?）
- [ ] 新增 LLM 工具 `task_update`：更新任务状态（claim/complete）
- [ ] 新增 LLM 工具 `task_list`：查看当前 session 所有任务
- [ ] 持久化：tasks 存在 session 数据里（SQLite）
- [ ] Renderer：侧边栏或对话区显示任务清单（简洁，不喧宾夺主）
- [ ] 验证：agent 创建 3 个有依赖的任务，按序完成

### 设计约束
- Task list 是 session 级的，跟随 session 生命周期
- 任务数量上限 50（防止 token 膨胀）
- 工具定义注入 system prompt 时，附带当前任务清单摘要

---

## F046: Agent 间可见

### 背景
当前每个 agent 只看到用户消息和自己的回复，看不到同 session 里其他 agent 说了什么。Claude Code agent teams 里队友能看到彼此的输出。

### 需求
- [ ] 构建 agent 上下文时，注入同 session 其他 agent 的近期消息（最近 N 条）
- [ ] 注入格式：`[Teammate <name>]: <message summary>`
- [ ] 上限：最多注入最近 10 条其他 agent 消息，每条截断到 200 字
- [ ] 可配置：settings 里可关闭（默认开启）
- [ ] 验证：agent A 回复后，agent B 被 @mention 时能引用 A 说的内容

### 设计约束
- 注入位置：system prompt 末尾，在工具定义之前
- Token 预算：其他 agent 消息总共不超过 4000 字符
- 不改变消息存储格式，只在构建 prompt 时动态注入

---

## F047: Agent 间直接通信

### 背景
Claude Code agent teams 里队友可以直接互发消息。Paw 当前 agent 只能回复用户，不能主动给另一个 agent 发消息。

### 需求
- [ ] 新增 LLM 工具 `send_message`：agent 给同 session 另一个 agent 发消息
- [ ] 参数：targetAgent (name/id), message (string)
- [ ] 收到消息的 agent 自动触发一轮回复（异步，不阻塞当前 agent）
- [ ] 消息在对话流里显示为 agent-to-agent 消息（区别于用户消息和 agent 回复）
- [ ] Renderer：agent 间消息用不同样式（比如缩进或不同背景色）
- [ ] 防循环：同一对 agent 之间最多连续 5 轮自动通信，超过后暂停等用户介入
- [ ] 验证：agent A 主动给 agent B 发消息，B 自动回复，对话流里可见

### 设计约束
- send_message 只在多 agent session 里可用（单 agent session 不注入此工具）
- 每轮 agent 间通信消耗正常 token，计入 session 用量
- 用户随时可以打断 agent 间对话（发送新消息即中断）

---

## F048: 自动轮转

### 背景
Claude Code agent teams 里队友做完一个任务会自动 claim 下一个。Paw 当前需要用户手动 @mention 才能触发 agent 回复。

### 需求
- [ ] 当 agent 完成一个 task（调用 task_update status=done）时，检查是否有其他 agent 的 pending task 被 unblock
- [ ] 如果有，自动触发该 agent 开始工作（相当于系统自动 @mention）
- [ ] 触发消息格式：`[System] Task "<title>" completed by <agent>. <next_agent>, your task "<next_title>" is now unblocked.`
- [ ] 自动轮转可在 settings 里关闭（默认开启）
- [ ] 验证：3 个 agent 分别负责 3 个有依赖的任务，第一个完成后自动触发第二个

### 设计约束
- 自动轮转只在有 task list 的 session 里生效
- 同时最多 1 个 agent 在执行（串行，不并行——Electron 单进程限制）
- 如果没有 task list，保持现有 @mention 行为不变
