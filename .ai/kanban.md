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

## 下一个：M35 — 存储统一

### P0 存储统一
| Feature | 状态 | 说明 |
|---------|------|------|
| F200 全局配置迁移到 ~/.paw/ | ⬜ 待做 | settings.json / workspaces.json / prefs.json / user-avatar 全部移到 ~/.paw/ |
| F201 启动自动迁移 | ⬜ 待做 | 检测旧路径，自动迁移到 ~/.paw/，一次性 |
| F202 Session 存储归属 | ⬜ 待做 | 每个 workspace 各自存 .paw/sessions.db |
| F203 @mention 自动补全 | ⬜ 待做 | 输入 @ 弹出参与者列表，模糊搜索 |
| F204 工具调用显示优化 | ⬜ 待做 | 折叠状态一句话概括 |
| F205 Workspace 管理 | ⬜ 待做 | 添加已有文件夹 / 创建新 workspace / 删除 |
| F206 Coding Agent 管理 | ⬜ 待做 | 选引擎 + 项目文件夹 |
| F207 新建对话页修正 | ⬜ 待做 | Workspace 和 CA 分开展示 |
| F208 冷启动页 | ⬜ 待做 | 首次启动引导 |
| F209 错误消息持久化 | ⬜ 待做 | 错误信息存入 messages 表 |
| F210 输入框/附件跟随对话 | ⬜ 待做 | 切换 session 保存草稿 |
| F211 回复失败重试 | ⬜ 待做 | 重试按钮 |
| F212 Cmd+Shift+S 切换侧边栏 | ⬜ 待做 | 快捷键 |

---

## 已完成

| 里程碑 | 描述 | 状态 |
|--------|------|------|
| M34 | UI Polish + React 迁移 | ✅ |
| M33 | Skill Creator + MCP + Cron 对齐 OpenClaw | ✅ |
| M32 | 多 Workspace IM 体验 | ✅ |
| M20 | 工具层抽象 + Claude Code | ✅ |
| M16 | Agent Team | ✅ |
| M1–M9 | 基础功能（Chat/Settings/Sessions/Tools/Heartbeat/Tray） | ✅ |

## 暂停
- M23 — 单 Agent 完全可用（F092-F101）
- M22 — acpx 协议接入（F085-F091）
