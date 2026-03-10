# M27 Kickoff — 最终对齐 OpenClaw + 架构品味升级

## 一句话目标
补齐所有剩余策略差距，提升代码品味到 OpenClaw 水准，让每个模块的行为和架构完全对齐。

## 审查发现的剩余差距

### A. API 调用健壮性（Paw 完全没有）

| ID | Feature | 说明 |
|----|---------|------|
| F124 | API retry + backoff | 429/500/503 自动重试（3 次，指数退避 + jitter） |
| F125 | Overload 错误提取 | 从 Anthropic/OpenAI error response 提取 retry-after |
| F126 | NO_REPLY 过滤 | 模型回复 NO_REPLY 时不显示给用户，静默处理 |

### B. Session Pruning 策略对齐

| ID | Feature | 说明 |
|----|---------|------|
| F127 | Pruning minPrunableChars 对齐 | OpenClaw 默认 50000，我们是 500，差 100 倍 |
| F128 | Pruning cache-TTL 模式 | 只在缓存过期后才 prune（而不是每次） |

### C. Prompt 结构对齐

| ID | Feature | 说明 |
|----|---------|------|
| F129 | System prompt 结构化 | OpenClaw 有固定 section 顺序：Tooling → Safety → Skills → Workspace → DateTime → Runtime。我们的是随意拼接 |
| F130 | 时间注入 | 注入时区（不注入动态时间，保持缓存稳定） |
| F131 | Runtime 元信息 | 注入 host/OS/model/version 等单行信息 |
| F132 | Safety 提示 | 注入简短安全规则（不追求 power-seeking） |

### D. Compaction 细节

| ID | Feature | 说明 |
|----|---------|------|
| F133 | Compaction 重试 | compaction 后自动 retry 原始请求 |
| F134 | 摘要 transcript 截断 | 只截前 30000→保留足够上下文但有最大值 |

### E. 工具行为

| ID | Feature | 说明 |
|----|---------|------|
| F135 | file_read offset/limit | 大文件支持分页读取（OpenClaw read 的 offset/limit） |
| F136 | file_write 自动创建目录 | 写入时自动 mkdir -p |

## 红线
- 不动 multi-agent
- 不动 UI 布局
- 改代码前必须先 Read
- 每个 feature 独立可验证
