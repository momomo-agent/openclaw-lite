# Kanban — Paw 全局看板

## 已完成：M33 — Skill Creator + MCP + Cron 对齐 OpenClaw ✅

### P1 Skill Creator + Frontmatter ✅
| Feature | 状态 | 说明 |
|---------|------|------|
| F180 Frontmatter 解析器重写 | ✅ 完成 | 连字符键、多行值、CRLF、metadata JSON 解析 |
| F181 skill_create 工具 | ✅ 完成 | OpenClaw 对齐 name 标准化 + 脚手架 |
| F182 skill_exec 增强 | ✅ 完成 | run.py 支持 + WORKSPACE_DIR 环境变量 |
| F183 Installer 修复 | ✅ 完成 | uv tool install + npm --ignore-scripts + command -v |

### P2 MCP 支持（Native Client）✅
| Feature | 状态 | 说明 |
|---------|------|------|
| F184 MCP 配置格式 | ✅ 完成 | command + args + env，对齐 OpenClaw/Claude Desktop |
| F185 MCP Client | ✅ 完成 | @modelcontextprotocol/sdk，stdio JSON-RPC |
| F186 MCP 工具注册 | ✅ 完成 | mcp__{server}__{tool} 命名，动态合并 |
| F187 MCP Settings UI | ✅ 完成 | JSON textarea + 状态显示 + 自动重连 |
| F187b mcp_config 对话工具 | ✅ 完成 | agent 可通过对话 add/remove/update MCP server |

### P3 Cron 定时任务 ✅
| Feature | 状态 | 说明 |
|---------|------|------|
| F188 CronService | ✅ 完成 | Timer 常量/backoff/recovery 完全对齐 OpenClaw |
| F189 Cron 执行路径 | ✅ 完成 | main (systemEvent) + isolated (agentTurn) |
| F190 cron 工具 | ✅ 完成 | 8 actions 完整对齐 |
| F191 Heartbeat 重构 | ✅ 完成 | 委托给 CronService + legacy fallback |

---

## 已完成：M32 — 多 Workspace IM 体验 ✅

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
