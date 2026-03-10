# M26 Kickoff — 策略细节对齐 OpenClaw

## 一句话目标
每个模块的具体策略参数和行为都对齐 OpenClaw，不留模糊地带。

## Feature 清单

### P0（高频/核心）

| ID | 模块 | 差距 | 对齐目标 |
|----|------|------|----------|
| F114 | /model 命令 | 无 | 切换模型，显示当前模型，列出可选模型 |
| F115 | Bootstrap 限制 | totalMaxChars=80k | 调到 150k + 截断时注入 warning 提示 |
| F116 | Pruning 双级 | 只有一级截断 | soft-trim（保留 head+tail）+ hard-clear 两级 |
| F117 | Loop detection 三级 | 只有 blocked | warning → critical → circuit-breaker 三级 + knownPollNoProgress |
| F118 | Prompt caching 多断点 | 只标 system | system + tools + 最后一条 user message 分别标 cache_control |

### P1（实用体验）

| ID | 模块 | 差距 | 对齐目标 |
|----|------|------|----------|
| F119 | /export 命令 | 无 | 导出 session 为 HTML（含 system prompt） |
| F120 | /model 列表 | 无 | 从 config 读取 models 列表，支持编号选择 |
| F121 | Exec approval 持久化 | 一次性弹窗 | 记住用户选择到 .paw/exec-approvals.json |
| F122 | Failover cooldown | 简单 try-catch | 指数退避（1m/5m/25m/1h cap）+ billing disable |
| F123 | Compaction identifier 保留 | 无 | 摘要时保留文件路径、ID 等标识符 |

## 红线
- 不动 multi-agent
- 不动 UI 布局
- 每个 feature 独立可验证
