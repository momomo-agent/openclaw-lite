# Kanban — Paw 全局看板

## 进行中：M38 — Coding Agent 作为对话参与者 ✅ 完成

### P0 核心功能
| Feature | 状态 | 说明 |
|---------|------|------|
| F255 CA Participant 数据模型 | ✅ 完成 | participants 支持 coding-agent 类型 |
| F256 消息路由支持 CA | ✅ 完成 | 走 ACPX/SDK 而不是内部 LLM |
| F257 新建对话 CA 入口 | ✅ 完成 | NewChatSelector 里选 CA → 选文件夹 → 创建对话 |
| F258 成员管理添加 CA | ✅ 完成 | MembersPanel 添加成员时可选 CA |
| F259 清理旧 CC 面板 | ✅ 完成 | 删除 cc-status/cc-output 相关代码 |

### 收尾项
| 项目 | 状态 | 说明 |
|------|------|------|
| workspace-changed 全局事件 | ✅ 完成 | eventBus 广播 + App.tsx 全局监听，响应式 UI 更新 |
| CC session persistence | ✅ 完成 | sessionCCSessions Map + .paw/cc-sessions.json 持久化 |
| sidebar rename zero layout shift | ✅ 完成 | overlay input 方案 |
| 群聊历史 sender label | ✅ 完成 | React 路径修复 |
| frosted glass headers + CA status | ✅ 完成 | sidebar coding agent 状态显示 |

---

## 已完成：M35 — 存储统一 + 体验优化 ✅

### P0 存储统一
| Feature | 状态 | 说明 |
|---------|------|------|
| F200 全局配置迁移到 ~/.paw/ | ✅ 完成 | GLOBAL_DIR 已指向 ~/.paw/ |
| F201 启动自动迁移 | ✅ 完成 | coding-agents.json 自动迁移 |
| F202 Session 存储归属 | ✅ 完成 | 每个 workspace 各自 .paw/sessions.db |
| F203 @mention 自动补全 | ✅ 完成 | 群聊 @ 触发下拉，fuzzy 匹配，pill token |
| F204 工具调用显示优化 | ✅ 完成 | ToolGroup 折叠/展开 |
| F205 Workspace 管理 | ✅ 完成 | workspace-add/remove/create IPC |
| F206 Coding Agent 管理 | ✅ 完成 | SettingsPanel + NewChatSelector |
| F207 新建对话页修正 | ✅ 完成 | NewChatSelector 498 行 |
| F208 冷启动页 | ✅ 完成 | SetupScreen 245 行 |
| F209 错误消息持久化 | ✅ 完成 | isError 存 metadata，重启后可见 + 重试 |
| F210 输入框/附件跟随对话 | ✅ 完成 | InputBar drafts Map |
| F211 回复失败重试 | ✅ 完成 | MessageItem retry 按钮 |
| F212 Cmd+Shift+S 切换侧边栏 | ✅ 完成 | Sidebar 快捷键 |

---

## 已完成

| 里程碑 | 描述 | 状态 |
|--------|------|------|
| M35 | 存储统一 + 体验优化 | ✅ |
| M34 | UI Polish + React 迁移 | ✅ |
| M33 | Skill Creator + MCP + Cron 对齐 OpenClaw | ✅ |
| M32 | 多 Workspace IM 体验 | ✅ |
| M20 | 工具层抽象 + Claude Code | ✅ |
| M16 | Agent Team | ✅ |
| M1–M9 | 基础功能（Chat/Settings/Sessions/Tools/Heartbeat/Tray） | ✅ |

## 暂停
- M23 — 单 Agent 完全可用（F092-F101）
- M22 — acpx 协议接入（F085-F091）
