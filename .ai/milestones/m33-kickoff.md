# M33: Skill Creator + MCP + Cron — 对齐 OpenClaw

## 目标
完全对齐 OpenClaw 的三个核心能力：Skill 创建、MCP 支持、Cron 定时任务。适配 Paw 的 Electron + CommonJS 架构。

## 成果

### P1 Skill Creator + Frontmatter ✅
- F180: Frontmatter 解析器重写（连字符键、多行值、CRLF、metadata JSON）
- F181: skill_create 工具（name 标准化 + 校验 + 脚手架）
- F182: skill_exec 增强（run.py 支持 + WORKSPACE_DIR）
- F183: Installer 修复（uv tool install + npm --ignore-scripts + command -v）

### P2 MCP 支持（Native Client）✅
- F184: MCP 配置格式对齐 OpenClaw/Claude Desktop
- F185: MCP Client（@modelcontextprotocol/sdk + StdioClientTransport）
- F186: MCP 工具注册（mcp__{server}__{tool} 命名，动态合并）
- F187: MCP Settings UI（JSON textarea + 状态 + 自动重连）
- F187b: mcp_config 对话工具（Paw 增强，agent 可通过对话管理 MCP server）

### P3 Cron 定时任务 ✅
- F188: CronService（Timer/backoff/recovery 完全对齐 OpenClaw）
- F189: Cron 执行路径（main + isolated）
- F190: cron 工具（8 actions 完整）
- F191: Heartbeat 重构（委托 CronService + legacy fallback）

## 架构决策
- OpenClaw 用 ACPX proxy 注入 MCP → Paw 做 native MCP client（无 ACP，必要差异）
- MCP tool 命名 `mcp__{serverName}__{toolName}`（双下划线分隔）
- Cron 简化：省略 delivery/stagger/run log/session reaper（Paw 单机，无需）
- mcp_config 为 Paw 独有增强（OpenClaw 无 agent-facing MCP 配置工具）

## 新增依赖
- `@modelcontextprotocol/sdk` — MCP 协议 SDK
- `croner` — cron 表达式解析

## Commit
`dfcbf42` feat: M33 Skill Creator + MCP + Cron — 对齐 OpenClaw
