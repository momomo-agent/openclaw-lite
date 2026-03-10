# M24 Kickoff — 单 Agent 对齐 OpenClaw 第二轮

## 一句话目标
补齐 system prompt 安全、slash 命令、tool result 截断、prompt caching、后台进程、token 追踪，达到 OpenClaw 单 agent 同等能力。

## 包含 Feature

### P0

| ID | Feature | 说明 |
|----|---------|------|
| F102 | Bootstrap 文件大小限制 | 注入 system prompt 的文件加 maxChars 截断 + 总量上限 |
| F103 | Tool result 入库截断 | tool results 存 SQLite 前截断到合理大小 |
| F104 | Slash 命令: /new /status /compact | /new 新建 session、/status 显示用量、/compact 手动压缩 |
| F105 | Background exec + process 管理 | shell_exec 支持后台运行 + timeout 可配 + process poll/kill |
| F106 | Token 使用追踪 | 记录每次 API 调用的 input/output tokens，session 累计 |

### P1

| ID | Feature | 说明 |
|----|---------|------|
| F107 | Anthropic Prompt Caching | 加 cache_control 标记降低成本 |

## 红线
- 不动 multi-agent（已稳定）
- 不加新 provider
- 每个 feature 独立可验证
