# M29 — 最终精准对齐 OpenClaw（源码逐行审计）

## 审计方法
逐文件读 OpenClaw src/agents/pi-embedded-runner/ 所有运行时文件，对比 Paw 的每个等价模块。

## 发现的最终差距

### A. Paw 的 scrubMagicStrings 写了但没接入

F147 虽然写了 scrubMagicStrings()，但没有在任何地方调用。OpenClaw 在 systemPrompt 上调用。

| ID | 差距 | 说明 |
|----|------|------|
| F149 | scrubMagicStrings 实际接入 | 在 buildSystemPrompt 返回前 + 用户 prompt 发送前调用 |

### B. 历史消息卫生（OpenClaw 有，Paw 无）

| ID | 差距 | 说明 |
|----|------|------|
| F150 | Anthropic turn validation | 确保 user/assistant 严格交替，防止连续 user 或 assistant 消息 |
| F151 | tool_use/tool_result 配对修复 | 截断历史后可能出现孤儿 tool_result，需要修复 |
| F152 | 历史轮数限制 | 可配置的 historyLimit（限制最近 N 轮 user turn） |

### C. Context 管理精细化

| ID | 差距 | 说明 |
|----|------|------|
| F153 | 孤儿 user 消息修复 | 会话末尾如果是 user 消息，新 prompt 会违反 role ordering |
| F154 | 动态 context window 解析 | 根据模型自动确定 context window 大小，不硬编码 200000 |

### D. Session 生命周期

| ID | 差距 | 说明 |
|----|------|------|
| F148 | Session 自动过期 | daily reset (可配置时间) + idle timeout (可配置分钟数) |

### E. Prompt 细节

| ID | 差距 | 说明 |
|----|------|------|
| F155 | SOUL.md 特殊处理 | 检测 SOUL.md 存在时注入 "embody its persona and tone" 指导 |
| F156 | 截断 warning 改用 Bootstrap 列表格式 | 列出具体被截断的文件名 |

## 红线
- 不动 multi-agent / UI 布局
- 每个 feature 独立可验证
