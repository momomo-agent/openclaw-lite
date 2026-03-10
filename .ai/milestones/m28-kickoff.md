# M28 — 深度对齐 OpenClaw 源码级策略

## 审计方法
逐文件对比 OpenClaw 源码（`/Users/kenefe/LOCAL/momo-agent/studies/openclaw/src/agents/`）和 Paw 所有模块。

## 发现的差距（按优先级排序）

### P0 — 影响正确性的关键差距

| ID | 模块 | 差距 | OpenClaw 策略 | Paw 现状 |
|----|------|------|-------------|---------|
| F137 | tool-result-truncation | 单条 tool result 大小限制 | 30% context window，hard cap 400k chars，head+tail 截断保留错误信息 | 只有 `TOOL_RESULT_MAX_CHARS = 50000` 简单截断，不保留尾部错误信息 |
| F138 | context-window-guard | 上下文总量守卫 | 发送前检查总 context chars < 75% context window，超出时压缩最旧 tool results | 无。完全依赖 compaction 事后补救 |
| F139 | loop-detection thresholds | 阈值偏差太大 | warning=10, critical=20, circuit-breaker=30 | warning=3, critical=5, circuit-breaker=8（太激进，正常使用会误触发） |
| F140 | error-handling | API 错误分类 + 上下文溢出检测 | 分类 billing/auth/rate-limit/overload/context-overflow，context overflow 时自动 compaction+retry | 直接 throw Error，不分类不重试 |
| F141 | tool-result hash | 稳定哈希用于 loop detection | SHA256 哈希 tool_name + stable-stringify(params) | JSON.stringify 直接拼接（key 顺序不稳定） |

### P1 — 影响架构品味

| ID | 模块 | 差距 | OpenClaw 策略 | Paw 现状 |
|----|------|------|-------------|---------|
| F142 | system-prompt structure | section 顺序不完全对齐 | Tooling → Tool Call Style → Safety → Skills → Memory → Workspace → DateTime → Silent Replies → Heartbeats → Runtime | Safety → Workspace → DateTime → Runtime → 随意拼接 workspace files → tools |
| F143 | silent-reply handling | 模型输出 HEARTBEAT_OK 处理 | 检测 leading/trailing HEARTBEAT_OK，标记 ack 可丢弃 | heartbeat 回复只检查 includes('HEARTBEAT_OK')，不够精准 |
| F144 | tool-call-style prompt | 工具调用风格指导 | 明确指导：routine 调用不解释，复杂/敏感才解释 | 无此 section |
| F145 | compaction retry-on-overflow | 上下文溢出自动 compaction | 检测 isLikelyContextOverflowError → 自动 compaction → retry 原始请求 | compaction 只在发送前按 threshold 触发，溢出后 throw |
| F146 | usage accumulator | 多轮 tool-call 的 token 统计 | 累积 input/output/cacheRead/cacheWrite，lastCacheRead 用于 context 大小估算 | 只统计单轮 input+output，多轮不累积 |

### P2 — 增强体验

| ID | 模块 | 差距 | OpenClaw 策略 | Paw 现状 |
|----|------|------|-------------|---------|
| F147 | magic-string scrub | 防 Anthropic refusal injection | 检测 ANTHROPIC_MAGIC_STRING_TRIGGER_REFUSAL 并替换 | 无 |
| F148 | session-staleness | 会话过期 + 自动重置 | daily reset (4AM) + idle timeout，/reset /new 命令 | 有 /reset 命令但无自动过期逻辑 |

## 红线
- 不动 multi-agent
- 不动 UI 布局
- 每个 feature 独立可验证
