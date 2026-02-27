# Vision — OpenClaw Lite

## 一句话
便携式本地 AI 助手桌面客户端，兼容 OpenClaw 数据格式，打开就用。

## 核心理念
- **两个目录，一个 Claw** — 数据目录（config/skills/memory）+ 工作区目录（AGENTS.md/项目文件），换台电脑指定目录就能用
- **兼容 OpenClaw** — 可以直接读写 OpenClaw 的 `~/.openclaw/` 和 `~/clawd/` 数据，无缝切换
- **本地优先** — API key 存本地，对话在本地，不经过第三方服务器
- **轻量** — 不需要 Gateway、不需要消息通道、不需要 Node.js 后端常驻

## 目标用户
- 已有 OpenClaw 的用户，想要一个桌面 GUI
- 想要本地 AI 助手但觉得 OpenClaw 太重的用户

## 成功标准
- 选两个目录，配好 API key，就能对话
- 支持多轮对话 + 工具调用（搜索/代码/文件）
- 能读写 OpenClaw 的 SOUL.md / MEMORY.md / skills/
- macOS 原生体验（后续可扩展 Windows/Linux）
