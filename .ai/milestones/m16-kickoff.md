# M16 Kickoff — Agent Team（真正的多 Agent 协作）

## 一句话目标

从"伪群聊（轮流单聊）"升级为"真团队协作"：共享任务清单、队友间直接通信、计划审批门禁。

## 参照物

Claude Code Agent Teams（实验功能，2026 年文档）：
- 共享 task list（pending/in-progress/completed + 依赖关系）
- 队友自领取（self-claim）+ 文件锁防竞争
- 队友间直接 message（不只回 leader）
- Plan approval（先 plan 再执行，leader 审批）
- TeammateIdle / TaskCompleted hooks 做门禁

## Paw 当前基线

- Session 有 members 数组，可添加/移除 agent
- @mention 路由到指定 agent，fallback 到首个 agent
- 每次只有一个 agent 回复，其他 agent 看不到彼此的回复
- 没有任务清单、没有 agent 间通信、没有审批机制

## 核心需求（不能砍）

| # | 需求 | 对标 Claude Code |
|---|------|-----------------|
| F045 | 共享 Task List — session 级任务清单，pending/in-progress/done + 依赖 | task list + dependencies |
| F046 | Agent 间可见 — agent 回复时注入其他 agent 的近期消息作为上下文 | teammates see each other |
| F047 | Agent 间直接通信 — agent 可以主动给另一个 agent 发消息 | inter-agent messaging |
| F048 | 自动轮转 — 一个 agent 回复完后，自动触发下一个相关 agent | self-claim + auto-rotation |

## 可延后需求

| # | 需求 | 说明 |
|---|------|------|
| F049 | Plan approval — agent 先输出计划，用户/leader 审批后才执行 | 需要 UI 支持 approve/reject |
| F050 | 后台 spawn — agent 可以在后台启动新的 agent session | 类似 subagent |
| F051 | Task hooks — 任务完成/agent 空闲时触发自定义检查 | TeammateIdle/TaskCompleted |

## 红线

- 不改变现有单 agent 对话体验（向后兼容）
- Task list 是 session 级的，不是全局的
- Agent 间通信不能无限循环（设最大轮次）
- Token 消耗要可控（注入上下文有上限）

## 追求标准

- 好体验：用户在群聊里能看到 agent 之间的对话，像真人协作
- 好品位：任务清单 UI 简洁，不喧宾夺主
- 好技术：通信协议清晰，不靠 hack
