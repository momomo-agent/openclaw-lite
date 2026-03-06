# Growth Log

## M1 — Setup + Chat (v0.1.0)
- Electron 壳 + preload + renderer
- Setup 引导（选择/创建工作区）+ Chat 界面
- Anthropic API 对话闭环
- Gate: DBB 6/6 ✅

## M2 — Settings + Streaming + Tools (v0.2.0)
- Settings overlay（provider/apiKey/baseUrl/model/tavilyKey）
- SSE streaming 逐字输出
- 4 个工具（search/code_exec/file_read/file_write）
- code_exec 从 eval 改为 vm sandbox（安全修复）
- Gate: DBB 6/6 + 对话验证 ✅

## M3 — Sessions (v0.3.0)
- 侧边栏 session 列表 + 新建/切换/删除
- sessions/*.json 持久化，重启恢复
- 对话导出 markdown
- Gate: DBB 6/6 + 持久化文件验证 ✅

## M5 — 生态兼容 + 打包 (v0.5.0)
- OpenClaw 格式兼容（memory/ 读取）
- highlight.js 代码高亮
- Cmd+K 聚焦
- electron-builder DMG 打包 + Developer ID 签名
- Gate: DBB 6/6 ✅

## M6 — Multi-Agent (v0.6.0)
- Agent 创建/编辑/删除
- Session members（多 agent 群聊）
- Gate: DBB 6/6 ✅

## M7 — 附件 + 多窗口 (v0.7.0)
- 图片附件（拖拽/粘贴/📎）
- 多窗口支持（独立工作区）
- Gate: DBB 6/6 + E2E ✅

## M8 — 基础能力层 (v0.8.0)
- Heartbeat 定时心跳（Settings 开关 + 间隔配置）
- Skill 完整支持（读 SKILL.md 全文注入 prompt，之前只列名字）
- 跨对话记忆同步（共享 memory/ + SHARED.md + sync 指引）
- 系统通知（Electron Notification + notify 工具）
- shell_exec 工具（skill 脚本执行基础）
- **教训**: Edit 匹配两处 `return { answer: fullText }` 报错，需用更精确上下文
- Gate: DBB 6/6 + E2E ✅

## M9 — 体验层 (v0.9.0)
- 侧边栏实时状态指示器（thinking/tool/done/idle + pulse 动画）
- 文件路径点击打开（图片内联预览、md 渲染、其他系统打开）
- Menubar Tray 图标 + tooltip 跟随 agent 状态
- pushStatus() 统一状态推送（前端 + Tray 同步）
- **教训**: 插入 pushStatus 时破坏了 sendNotification 函数定义导致语法错误，自审应在 commit 前跑 `node --check main.js`
- Gate: DBB 6/6 + E2E ✅

## 流程补债 (2026-02-28)
- 补建 features.json（F001-F022，M1-M9 全量）
- 补更新 state.json（M9 / gate-passed / v0.9.0）
- 补写 growth.md（M1-M9 全部迭代记录）
- 更新 methodology.md（加 commit 前 checklist + 6 条教训）
- 原因：M8/M9 跳过了 PLAN 阶段和完整 REVIEW

### 教训总结
1. 一次只做一个 feature，不要批量塞
2. Edit 前先确认匹配唯一性
3. 插入代码后 Read 确认没破坏相邻函数
4. commit 前 `node --check main.js`
5. growth.md 实时写不攒
6. DBB 必须截图 + taste.md 对照

## M16 — Agent Team (v0.16.0)
- F045: 共享 Task List（SQLite tasks 表 + task_create/task_update/task_list 工具 + prompt 注入 + 侧边栏 UI）
- F046: Agent 间可见（注入其他 agent 近期消息到 system prompt）
- F047: Agent 间直接通信（send_message 工具 + 防循环 + agent-to-agent 消息样式）
- F048: 自动轮转（task 完成后自动触发 unblocked agent）
- 对标 Claude Code Agent Teams 设计
- Gate: 语法检查 ✅，E2E + DBB 待验证

## M19 — 主/轻量 Agent 分层 (v0.20.0)
- F061: 轻量 Agent 数据模型（session_agents SQLite 表 + CRUD 函数）
- F062: 轻量 Agent CRUD（IPC handlers + preload + create_agent/remove_agent LLM 工具）
- F063: 主 Agent 身份确立（chat handler 支持轻量 agent ID，role 注入 system prompt）
- F064: 轻量 Agent 对话路由（@mention 优先查 session agents，fallback 查模板）
- F065: 轻量 Agent UI（Members 面板：创建角色 + 从模板添加 + 删除）
- F066: Agent 工具适配（send_message/auto-rotation 支持轻量 agent）
- 设计选择：所有 agent 平等参与，不区分 subagent/teammate，不做能力限制
- Gate: 语法检查 ✅，E2E 启动 ✅，功能验证待做
