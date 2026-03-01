# Vision — [待命名]

## 一句话
便携式本地 AI 助手桌面客户端，一个文件夹就是一个 Claw。

## 核心理念
- **一个文件夹，一个 Claw** — config、skills、memory、项目文件全在一个目录，换台电脑拷过去就能用
- **兼容 OpenClaw** — 数据格式和存储逻辑完全兼容 OpenClaw，可以直接读写 OpenClaw 的数据目录，冷启动的记忆文件也兼容
- **完全独立** — 不依赖 OpenClaw 也能独立使用，但能无缝读取和使用 OpenClaw 的数据
- **本地优先** — API key 存本地，对话在本地，不经过第三方服务器
- **轻量** — 不需要 Gateway、不需要消息通道、不需要后端常驻

## 多对话体验
- **对标 OpenClaw 在 Discord 上的体验** — 多 session、多频道感
- **Sub-agent / Multi-agent** — 基于 session 的，用户视角就是"群聊"
- **群聊模式** — 用户或 agent 都可以添加/删除成员，群员列表里显示所有参与者（人 + agent）
- **Session 即群聊** — 每个 session 是一个对话空间，可以有多个 agent 参与

## 目标用户
- 想要本地 AI 助手但觉得 OpenClaw 太重的用户
- 已有 OpenClaw 的用户，想要一个桌面 GUI
- 想要便携式 AI 工作环境的用户

## 成功标准
- 选一个文件夹，配好 API key，就能对话
- 多 session + multi-agent 群聊体验
- 支持工具调用（搜索/代码/文件）
- 能读写 SOUL.md / MEMORY.md / skills/
- 数据格式与 OpenClaw 完全兼容
- macOS 原生体验（后续可扩展 Windows/Linux）

## 待定
- 产品名称和项目名称待定
