# Kanban — Paw 全局看板

## 当前：M32 — 多 Workspace IM 体验

### P0 基础设施
| Feature | 状态 | 说明 |
|---------|------|------|
| F160 Feature flag 关闭旧功能 | ⬜ 待开始 | 轻量 agent / task bar / auto-rotate 隐藏 |
| F161 Workspace identity | ⬜ 待开始 | identity.json（name, avatar）存在 workspace 里 |
| F162 Workspace 注册表 | ⬜ 待开始 | 多 workspace 路径管理，启动时预加载 |
| F163 状态隔离 | ⬜ 待开始 | 单例 → Map<workspaceId, State> |
| F164 Session-Workspace 关联 | ⬜ 待开始 | session 增加 workspaceId + ownerId |

### P1 IM 体验
| Feature | 状态 | 说明 |
|---------|------|------|
| F165 Sidebar 按 workspace 分组 | ⬜ 待开始 | 头像 + 名称 + 可折叠 |
| F166 新建对话选择器 | ⬜ 待开始 | 选 Workspace 或 Coding Agent |
| F167 切换 session 自动切换 context | ⬜ 待开始 | 无感加载对应 workspace prompt |
| F168 人员管理页 | ⬜ 待开始 | 编辑名字/头像/简介，添加/移除 |

### P2 Coding Agent（MVP 后）
| Feature | 状态 | 说明 |
|---------|------|------|
| F169 Coding Agent 直连 | ⬜ 待开始 | 对话形式的终端体验 |
| F170 CLI 流式渲染 | ⬜ 待开始 | stdout/stderr 实时渲染 |
| F171 Session 持久化 | ⬜ 待开始 | coding agent 对话可回溯 |

### P3 群聊（MVP 后）
| Feature | 状态 | 说明 |
|---------|------|------|
| F172 Session participants + owner | ⬜ 待开始 | 群主 = 默认回复者 |
| F173 @mention 路由 | ⬜ 待开始 | @Name → 对应 workspace context |
| F174 群主默认回复 | ⬜ 待开始 | 不 @ 时群主回复 |
| F175 群成员管理 | ⬜ 待开始 | 拉人/踢人 |

## 暂停
- M23 — 单 Agent 完全可用（F092-F101）
- M22 — acpx 协议接入（F085-F091）
