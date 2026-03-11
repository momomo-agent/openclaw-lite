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

## M20 — 工具层抽象 + Claude Code (v0.21.0)
- F068: Tool Registry 重构（已有 tools/registry.js 基础上扩展 context）
- F069: Tool 协议定义（融入 F068，lightweight/persistent 区分）
- F070: 轻量工具迁移（main.js 1107→843 行, -24%，16 个工具全部在 tools/ 目录）
- F071: Claude Code 工具基础（tools/claude-code.js，--print --output-format json，5 分钟超时）
- F072: Claude Code UX（cc-status/cc-output 事件，streaming 面板，Stop 按钮，monospace 输出）
- F073: Claude Code 上下文（JSON 解析 session_id，--resume 多轮续接，cost 追踪）
- F074: 集成验证 — CDP 12/12 全通过：
  - TC1 Title ✅ TC2 Screen(chat) ✅ TC3 API(全 7 个新方法) ✅
  - TC4 Config(anthropic) ✅ TC5 Screenshot ✅ TC6 Console(0 errors) ✅
  - TC7 chatPrepare ✅ TC8 Sessions ✅ TC9 Agents ✅
  - TC10 SessionAgents ✅ TC11 Sidebar ✅ TC12 CC DOM vars ✅
- Gate: 语法 ✅, CDP 验证 ✅
- F061: 轻量 Agent 数据模型（session_agents SQLite 表 + CRUD + 级联删除 + 索引）
- F062: 轻量 Agent CRUD（3 IPC handlers + preload + create_agent/remove_agent LLM 工具）
- F063: 主 Agent 身份确立（agentId.startsWith('a') 走 session agent，主 Agent 用 SOUL.md）
- F064: 轻量 Agent 对话路由（@mention 优先查 session agents，fuzzy match，fallback 查模板）
- F065: 轻量 Agent UI（Members 面板：轻量 agent 列表 + 创建表单 + 从模板添加 + 删除）
- F066: Agent 工具适配（send_message 先查 session agents，session-agents-changed 事件同步 UI）
- F067: 集成验证 — 代码审查全通过（数据层 CRUD、IPC、路由、UI、工具适配）
- 新增 core/router.js：LLM 路由层（2消息策略 + fuzzy name match + JSON 解析 + fallback）
- 新增 templates/ 目录：AGENTS.md, HEARTBEAT.md, IDENTITY.md, SOUL.md, USER.md 工作区模板
- 设计选择：所有 agent 平等参与，不区分 subagent/teammate，不做能力限制
- 代码量：main.js 1107 + core/ 660 + renderer 888 + session-store 259 = ~2900 行
- Gate: 语法检查 ✅，代码审查 ✅，E2E 需手动验证

## M32 — 多 Workspace IM 体验 (v0.32.0)
- F160-F164: Workspace 基础设施（feature flag、identity、注册表、状态隔离、session 关联）
- F165-F168: IM 体验（sidebar 分组、新建选择器、context 自动切换、人员管理页）
- F169-F171: Coding Agent 直连（对话形式终端、CLI 流式渲染、session 持久化 + 容器缓存）
- F172-F175: 群聊（participants + owner、@mention 路由、群主默认回复、群成员管理）
- F176-F178: IM 侧边栏重设计（扁平列表、副文本状态切换、rename 不改排序）
- 架构变化：从单 workspace 工具升级为多 workspace IM
- Gate: 全部 19 features 完成 ✅

## M33 — Skill Creator + MCP + Cron 对齐 OpenClaw (v0.33.0)
- **P1 Skill Creator + Frontmatter 修复**
  - F180: Frontmatter 解析器重写 — 连字符键 `[\w-]+`、多行值（缩进续行）、CRLF 标准化、metadata JSON 解析（`openclaw`/`paw` 子对象）
  - F181: skill_create 工具 — OpenClaw 对齐 name 标准化（normalize → validate → scaffold）
  - F182: skill_exec 增强 — run.sh → run.py 优先级、`WORKSPACE_DIR` 环境变量
  - F183: Installer 修复 — `uv pip install` → `uv tool install`、npm `--ignore-scripts`、`which` → `command -v`
- **P2 MCP 支持（Native Client）**
  - F184: MCP 配置格式对齐 OpenClaw/Claude Desktop（command + args + env）
  - F185: MCP Client — `@modelcontextprotocol/sdk` + StdioClientTransport，`mcp__{server}__{tool}` 命名
  - F186: MCP 工具注册 — `getToolsWithMcp()` 动态合并内置 + MCP 工具
  - F187: MCP Settings UI — JSON textarea + 状态显示 + 自动重连
  - F187b: mcp_config 对话工具 — agent 可通过对话 add/remove/update/status MCP server（Paw 增强，OpenClaw 无此功能）
- **P3 Cron 定时任务**
  - F188: CronService — 完全对齐 OpenClaw timer 常量（MAX=60s, MIN_GAP=2s, STUCK=2h）、error backoff [30s,1m,5m,15m,60m]、启动恢复（清理 stale + 补跑 max 5）
  - F189: Cron 执行路径 — main (systemEvent) + isolated (agentTurn)
  - F190: cron 工具 — 8 actions 完整对齐（status/list/add/update/remove/run/runs/wake）
  - F191: Heartbeat 重构 — 委托给 CronService + legacy fallback
- 架构决策：OpenClaw 用 ACPX proxy 注入 MCP；Paw 无 ACP，做 native MCP client（必要差异）
- 新增依赖：`@modelcontextprotocol/sdk`、`croner`
- 新增文件：core/mcp-client.js (184行)、core/cron.js (~350行)、tools/cron.js、tools/skill-create.js、tools/mcp-config.js
- 改动文件：skills/frontmatter.js (重写)、tools/skill.js、skills/installer.js、main.js (重大)、tools/index.js、renderer/index.html、renderer/app.js、preload.js、core/prompt-builder.js、package.json
- 工具数从 20 增加到 24（skill_create、cron、mcp_config + 动态 MCP 工具）
- Gate: 语法检查 ✅，运行验证 ✅（npm start 无报错，MCP 实测可用）
