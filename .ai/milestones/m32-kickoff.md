# M32 — 多 Workspace IM 体验

## 一句话目标
Paw 从"单 assistant 工具"变成"AI 团队 IM"。多个 workspace（人）并行加载，单窗口切换，群聊即 multi-agent。

## 为什么做

Vision 范式转变（728e533）：
- **从工具到关系** — AI 不是可替换的功能模块，是有身份的角色
- **U盘隐喻** — 一个文件夹 = 一个人的工作包，物理可携带
- **IM 体验** — 多 workspace 并行加载，像管理联系人一样管理 assistant

当前代码是单 workspace 架构，无法支撑新 vision。

## 背景

聊天记录原文见 `/Users/kenefe/Downloads/talk_history.md`。核心决策：
1. 单窗口 + 多身份切换，不做多窗口多实例
2. 每个 workspace 有头像和名称，作为文件存在 workspace 里（identity）
3. 对话对象分两类：Workspace（有人格的全能助手）和 Coding Agent（项目文件夹 + CC/Codex/Gemini）
4. 群聊 = multi-agent，把多个 workspace 拉到同一个 session，@谁谁回复
5. 群主 = 默认回复者 + 协调者，不 @ 时群主回复
6. 旧的轻量 agent、task bar、auto-rotate 关闭但不删除

---

## P0 — 基础设施

| ID | Feature | 说明 |
|----|---------|------|
| F160 | Feature flag 关闭旧功能 | 轻量 agent（M19）、task bar、auto-rotate 的 UI 入口隐藏，代码路径加开关，不删除代码 |
| F161 | Workspace identity | 每个 workspace 文件夹包含 `identity.json`（name、avatar），头像图片存在 workspace 里 |
| F162 | Workspace 注册表 | App 级别维护已加载的 workspace 路径列表，启动时全部预加载到内存 |
| F163 | 状态隔离 | main.js 的 clawDir/config/systemPrompt 从单例改为 `Map<workspaceId, WorkspaceState>`，每个 workspace 独立的 SOUL/MEMORY/skills |
| F164 | Session-Workspace 关联 | session 元数据增加 `workspaceId` + `ownerId` 字段，session store schema 迁移 |

## P1 — IM 体验

| ID | Feature | 说明 |
|----|---------|------|
| F165 | Sidebar 按 workspace 分组 | 可折叠分组，显示 workspace 头像 + 名称，每组下面是该 workspace 的 session 列表 |
| F166 | 新建对话选择器 | 点"+"弹出选择：📁 Workspace（列出所有人）/ 💻 Coding Agent（选 agent 类型 + 项目文件夹） |
| F167 | 切换 session 自动切换 context | 点击不同 workspace 的 session 时，自动加载对应 workspace 的 system prompt，无感切换 |
| F168 | 人员管理页 | 列出所有 workspace（人），可编辑名字/头像/简介（SOUL.md），可添加新人（指向文件夹或新建），可移除 |

## P2 — Coding Agent 对话化

| ID | Feature | 说明 |
|----|---------|------|
| F169 | Coding Agent 直连 | 用户消息直接发给 CC/Codex/Gemini CLI，不经过 LLM 中间层。对话形式的终端体验 |
| F170 | CLI 流式渲染 | coding agent 的 stdout/stderr 实时流式渲染到 chat UI，支持 ANSI/markdown |
| F171 | Coding Agent session 持久化 | coding agent 对话存入 session store，可回溯 |

## P3 — 群聊（Multi-Workspace Session）

| ID | Feature | 说明 |
|----|---------|------|
| F172 | Session participants + owner | session 增加 `participants: workspaceId[]` + `ownerId`，owner 是默认回复者（群主） |
| F173 | @mention 路由 | 解析 `@Name` → 用该 workspace 的 SOUL/MEMORY 作为 system prompt 生成回复 |
| F174 | 群主默认回复 | 无 @ 时 → owner 的 workspace context 回复。群主可在 SOUL.md 里定义协调策略 |
| F175 | 群成员管理 | 在 session 内拉人/踢人 workspace 参与者 |

## P4 — 增强（后续）

| ID | Feature | 说明 |
|----|---------|------|
| F176 | Coding Agent context 注入 | coding agent 对话时可选注入某个 workspace 的 SOUL + MEMORY |
| F177 | Workspace 导入导出 | 一键打包 workspace 文件夹为 zip，导入时自动注册 |

---

## 废弃/迁移项

| 现有功能 | 处理方式 |
|----------|----------|
| M19 轻量 agent（session_agents 表） | F160 关闭。P3 群聊上线后，评估是否完全移除 |
| Task bar / task 系统 | F160 关闭。群聊模式不需要 |
| Auto-rotate | F160 关闭。用户通过 @mention 手动控制 |
| Members panel | P3 改造为群聊参与者管理 |
| Agent manager | P1 改造为人员管理页 |

## 实施顺序

```
F160 → F161 → F162 → F163 → F164（P0 基础设施）
  → F165 → F166 → F167 → F168（P1 IM 体验）
    → F169 → F170 → F171（P2 Coding Agent）
      → F172 → F173 → F174 → F175（P3 群聊）
```

P0 + P1 是 MVP。P2、P3 可以在 MVP 验证后再做。

## 红线
- 旧功能关闭但不删除代码，未来可能重新启用
- 现有单 workspace 对话体验不能回归
- 每个 feature 独立可验证
- `node --check main.js` 必须通过

## 成功标准
- [ ] 可同时加载多个 workspace，sidebar 按人分组
- [ ] 新建对话时选择跟谁说话
- [ ] 切换不同 workspace 的 session 时 context 自动切换
- [ ] 可编辑 workspace 的名字、头像、简介
- [ ] 旧的轻量 agent / task bar / auto-rotate 已关闭
