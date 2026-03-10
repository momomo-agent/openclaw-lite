# M25 Kickoff — 单 Agent 对齐 OpenClaw 第三轮

## 一句话目标
补齐 OpenAI token 追踪、/context + /reset + /stop 命令、可配置最大工具轮数、model failover、max_tokens 可配，达到 OpenClaw 单 agent 完全对齐。

## 包含 Feature

### P0

| ID | Feature | 说明 |
|----|---------|------|
| F108 | OpenAI token 追踪 | OpenAI streaming 解析 usage 字段 |
| F109 | /reset /stop 命令 | /reset 清空当前 session，/stop 中断当前请求 |
| F110 | /context 命令 | 显示 context 分解：bootstrap 文件大小 + tool schema + 历史 tokens |
| F111 | 可配置 max rounds | maxToolRounds 从 config 读取，默认 10 |
| F112 | max_tokens 可配 | 从 config 读取 maxTokens，默认 4096 |
| F113 | Model failover | 主模型失败时 fallback 到备选模型列表 |

## 红线
- 不动 multi-agent
- 不动 UI 布局
