# Vision — OpenClaw Lite

## 一句话
便携式本地 AI 助手桌面客户端，一个文件夹就是一个 Claw。

## 核心理念
- **一个文件夹，一个 Claw** — config、skills、memory、项目文件全在一个目录，换台电脑拷过去就能用
- **兼容 OpenClaw** — 可以直接读写 OpenClaw 的数据目录，无缝切换
- **本地优先** — API key 存本地，对话在本地，不经过第三方服务器
- **轻量** — 不需要 Gateway、不需要消息通道、不需要后端常驻

## 目标用户
- 想要本地 AI 助手但觉得 OpenClaw 太重的用户
- 已有 OpenClaw 的用户，想要一个桌面 GUI
- 想要便携式 AI 工作环境的用户

## 成功标准
- 选一个文件夹，配好 API key，就能对话
- 支持多轮对话 + 工具调用（搜索/代码/文件）
- 能读写 SOUL.md / MEMORY.md / skills/
- macOS 原生体验（后续可扩展 Windows/Linux）
