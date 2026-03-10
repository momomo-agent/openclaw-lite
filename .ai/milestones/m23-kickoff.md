# M23 Kickoff — 单 Agent 完全可用

## 一句话目标
单 agent 对话体验对齐 OpenClaw，补齐所有核心差距，做到「打开就能用、用起来不卡、用久了不乱」。

## 背景
对比 OpenClaw 2026.3.7 源码，单 agent 对话层面存在 9 项核心差距。M22 (acpx) 暂停，先把基础做扎实。

## 包含 Feature

### P0 — 不做就不能叫「可用」

| ID | Feature | 依赖 | 说明 |
|----|---------|------|------|
| F092 | 冷启动修复 | — | 没有文件夹时回到冷启动页面，不卡空白 |
| F093 | Session Pruning | — | 发 LLM 前裁剪旧 tool results（内存级），保留最近 N 轮完整 |
| F094 | Compaction 升级 | F093 | 基于模型 context window 动态触发 + memory flush turn + /compact 命令 |
| F095 | Loop Detection | — | 相同工具+相同参数重复调用检测，可配置阈值，超过中断 |
| F096 | edit 工具 | — | 精确文本替换（oldText→newText），不覆盖整个文件 |

### P1 — 体验提升

| ID | Feature | 依赖 | 说明 |
|----|---------|------|------|
| F097 | Exec 安全分层 | — | allowlist 模式 + 拒绝 PATH 注入 + 保留弹窗确认 |
| F098 | Session 生命周期 | — | 可配置 daily reset / idle reset，过期自动新建 |
| F099 | Heartbeat requestId 隔离 | — | heartbeat 用独立 requestId，不和手动对话抢通道 |

### P2 — 锦上添花

| ID | Feature | 依赖 | 说明 |
|----|---------|------|------|
| F100 | Scrollbar 美化 | — | 自定义 scrollbar + 防水平溢出 |
| F101 | 未读消息计数 | — | Menubar badge 显示未读 |

## 红线
- 不动 multi-agent 架构（M16/M19 已稳定）
- 不做 acpx（M22 暂停）
- 不加新 provider（双 provider 够用）
- 每个 feature 纵向切片，做完即可用

## 追求标准
- 好体验：对话流畅，长 session 不卡
- 好品位：错误提示友好，状态反馈清晰
- 好技术：不留技术债，每个模块边界清晰
