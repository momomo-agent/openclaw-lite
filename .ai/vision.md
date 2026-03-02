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

## Agent 模型

### 两种 Agent

**主 Agent** — workspace 的灵魂。

- 就是 SOUL.md + USER.md + 记忆 + 所有工具
- 不在群成员列表里，是默认回复者
- workspace 级别，永远在
- 一个 workspace 只有一个主 agent
- 多 agent session 里自然成为 coordinator，但不强制——它也可以自己干活

**轻量 Agent** — session 里的平等参与者。

- 只有名称 + 角色描述，没有独立记忆
- 在 session 内创建，存在 session 数据里，不持久化到 agents/
- 用完可以离开，session 结束就没了
- 主 agent 或用户都可以创建
- 和主 agent 能力完全一样（共享工具、共享记忆访问），区别只在身份和生命周期
- 不是被委派的工人，是群聊里的平等成员，用户可以直接 @它对话

```
Workspace
├── 主 Agent（SOUL.md、记忆、工具）— 永远在，默认 coordinator
└── Session
    ├── 轻量 Agent A（名称 + 角色）— 平等参与者，随时来去
    ├── 轻量 Agent B（名称 + 角色）— 平等参与者，随时来去
    └── 人
```

### 设计选择

- **不区分 subagent 和 teammate** — CC 区分了"被委派的工人"和"平等的协作者"，我们不区分。所有轻量 agent 都是群聊成员，平等参与。
- **不做能力限制** — 所有 agent 共享同一套工具。简单就是美。
- **agents/ 目录保留为模板库** — 常用的角色可以存为模板，快速拉进 session，但不是必经之路。

### Agent 的手：工具

工具是 agent 的行动能力，不是 agent 本身。

- **轻量工具**：单次调用（file_write、web_fetch、search）
- **重量工具**：持久进程（Claude Code、未来可能的浏览器 agent）
- CC 不是 agent — agent 有 soul、有记忆、有人格。CC 没有。Agent 在需要写代码时调 CC，就像人需要写代码时打开终端

### 现有基础

已实现（M16）：session 成员管理、@mention 路由、task 系统 + auto-rotation、teammate 上下文注入、agent 间通信。

待改造：当前所有 agent 同质（都是 agents/ 目录 JSON），需要拆分为主/轻量两层。agents/ 保留为常用 agent 模板库。

## 待定
- 产品名称和项目名称待定
