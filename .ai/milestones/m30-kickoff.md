# M30 — 模块清单对照 + 最终查漏

## 完整模块对照表

### ✅ 已完全对齐的模块

| OpenClaw 模块 | Paw 等价 | 状态 |
|--------------|---------|------|
| system-prompt.ts (725行) | core/prompt-builder.js | ✅ section 顺序对齐、SOUL.md 处理、Runtime 注入 |
| tool-loop-detection.ts (624行) | core/loop-detection.js | ✅ 三级检测、stable hash、阈值 10/20/30 |
| tool-result-truncation.ts | main.js truncateToolResult | ✅ 30% context window、head+tail、hasImportantTail |
| tool-result-context-guard.ts | core/context-guard.js | ✅ 75% headroom、oldest-first 压缩 |
| compaction (compact.ts) | core/compaction.js | ✅ 动态阈值、identifier 保留、transcript 截断 |
| session-pruning (context-guard) | core/session-pruning.js | ✅ soft-trim + hard-clear 双级、cache-TTL |
| failover-error.ts | core/failover.js | ✅ 指数退避 cooldown、billing 5h |
| bootstrap-files.ts | core/prompt-builder.js | ✅ 150k total、20k per-file、截断 warning |
| history.ts (limitHistoryTurns) | core/transcript-repair.js | ✅ configurable historyLimit |
| context-window-guard.ts | core/model-context.js | ✅ 动态解析、per-model context window |
| cache-ttl.ts | core/session-pruning.js | ✅ 5min TTL 窗口内不 prune |
| usage.ts | main.js usage accumulator | ✅ 多轮累积 |

### ❌ 仍有差距的模块

| OpenClaw 模块 | 差距 | 影响 |
|--------------|------|------|
| timeout.ts | Paw 无 agent timeout（模型调用无超时保护） | 中：模型卡死时 Paw 永远等待 |
| command-poll-backoff.ts | Paw 的 process poll 无退避（poll loop 无限制） | 低：用户手动 poll 时不影响 |
| bootstrap-budget.ts | Paw 截断 warning 只记文件名，不记 per-file 统计 | 低：功能有但信息量少 |
| sanitize-for-prompt.ts | Paw 无 prompt literal 注入防护 | 中：workspace 路径可能包含特殊字符 |
| current-time.ts | Paw 注入时区但不提供 session_status 等价命令获取精确时间 | 低：已注入时区 |
| tool-call-id.ts | Paw 不处理 tool_call_id 格式（Mistral 等 provider 可能拒绝） | 低：目前只支持 Anthropic/OpenAI |
| content-blocks.ts | Paw 不处理 content block 多态（image/audio/thinking） | 低：目前只处理 text |

## M30 Features（只做中等及以上影响的）

| ID | Feature | 说明 |
|----|---------|------|
| F157 | Agent timeout | 模型调用 + 工具执行的超时保护，默认 600s |
| F158 | Prompt literal 注入防护 | workspace 路径等用户数据注入 prompt 前转义 |
| F159 | Usage 缓存字段追踪 | cacheRead/cacheWrite 从 Anthropic 响应中提取 |

## 红线
- 不动 multi-agent / UI 布局
- 每个 feature 独立可验证
