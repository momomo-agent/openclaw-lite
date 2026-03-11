# Kanban — Paw 全局看板

## 当前：M32 — 多 Workspace IM 体验

### P0 基础设施 ✅
| Feature | 状态 | 说明 |
|---------|------|------|
| F160 Feature flag 关闭旧功能 | ✅ 完成 | 轻量 agent / task bar / auto-rotate 隐藏 |
| F161 Workspace identity | ✅ 完成 | identity.json（name, avatar）存在 workspace 里 |
| F162 Workspace 注册表 | ✅ 完成 | 多 workspace 路径管理，启动时预加载 |
| F163 状态隔离 | ✅ 完成 | buildSystemPrompt 支持 workspacePath 参数 |
| F164 Session-Workspace 关联 | ✅ 完成 | session 增加 workspaceId + ownerId |

### P1 IM 体验 ✅
| Feature | 状态 | 说明 |
|---------|------|------|
| F165 Sidebar 按 workspace 分组 | ✅ 完成 | 头像 + 名称分组渲染 |
| F166 新建对话选择器 | ✅ 完成 | 选 Workspace 创建关联 session |
| F167 切换 session 自动切换 context | ✅ 完成 | 无感加载对应 workspace prompt |
| F168 人员管理页 | ✅ 完成 | 编辑名字/头像/简介，添加/新建/移除 |

### P2 Coding Agent ✅
| Feature | 状态 | 说明 |
|---------|------|------|
| F169 Coding Agent 直连 | ✅ 完成 | 对话形式的终端体验 |
| F170 CLI 流式渲染 | ✅ 完成 | stdout/stderr 实时渲染 |
| F171 Session 持久化 | ✅ 完成 | coding agent 对话可回溯，session 容器缓存 |

### P3 群聊 ✅
| Feature | 状态 | 说明 |
|---------|------|------|
| F172 Session participants + owner | ✅ 完成 | 群主 = 默认回复者 |
| F173 @mention 路由 | ✅ 完成 | @Name → 对应 workspace context |
| F174 群主默认回复 | ✅ 完成 | 不 @ 时群主回复 |
| F175 群成员管理 | ✅ 完成 | 拉人/踢人 |

### P4 IM 侧边栏重设计 ✅
| Feature | 状态 | 说明 |
|---------|------|------|
| F176 扁平 IM 列表 | ✅ 完成 | 移除 workspace 分组，头像+标题+时间/副文本+状态点 |
| F177 副文本状态切换 | ✅ 完成 | 运行中=AI status（斜体），空闲=lastMsg，群聊加 sender 前缀 |
| F178 Rename 不改排序 | ✅ 完成 | renameSession API 仅更新 title，不改 updatedAt |

## 暂停
- M23 — 单 Agent 完全可用（F092-F101）
- M22 — acpx 协议接入（F085-F091）
