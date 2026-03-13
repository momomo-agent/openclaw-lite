# Vision — Paw

## 一句话
你的 AI 团队的操作系统。每个文件夹是一个 assistant，带着他的记忆、技能和所有工作产出，随时可以拷走继续工作。

## 核心理念

### 从工具到关系
- **AI 不是工具，是角色** — 每个 workspace 是一个有身份的 assistant，有自己的性格（SOUL.md）、记忆（MEMORY.md）、技能（skills/）
- **记忆 = 关系的本质** — 对话历史不是日志，是你和 assistant 的共同经历
- **Local-first = 关系的主权** — 你的 assistant、你的记忆、你的关系，全在你硬盘上，不在别人服务器

### U盘隐喻
- **一个文件夹 = 一个人的工作包** — config、skills、memory、sessions、所有产出，全在一个目录
- **物理可携带** — 拷到 U盘，带到另一台机器，立刻继续工作。不是"云端同步"，是"物理资产"
- **可以送人** — 训练好的 assistant 可以直接把文件夹给同事，他立刻获得所有 context
- **版本控制友好** — `git init` 在 workspace 里，assistant 的成长过程可以 commit，甚至可以 checkout 回到"三个月前的他"

### IM 体验
- **多 workspace 并行加载** — 一个窗口，多个 assistant，像 IM 一样切换对话
- **按身份分组** — 左侧 session 列表按 workspace 分组，每个 assistant 有自己的对话历史
- **新建对话选身份** — 点"新对话"时选择要跟谁说话，而不是"打开哪个窗口"
- **全部预加载** — 所有 workspace 启动时加载到内存，切换瞬间完成，没有等待

## 目标用户
- 想要本地 AI 助手但觉得 OpenClaw 太重的用户
- 需要管理多个专精 AI 的用户（设计师 Alice、代码助手 Bob、研究员 Carol）
- 想要"AI 团队"而不是"一个万能 AI"的用户
- 重视数据主权和隐私的用户

## 成功标准
- 启动后看到所有 workspace（assistant）列表，像 IM 联系人
- 点一个 assistant，立刻开始对话，没有加载等待
- 每个 assistant 记得之前所有对话，context 完整
- 可以把整个 workspace 文件夹拷到 U盘，换台机器继续用
- 支持工具调用（搜索/代码/文件/skills）
- 数据格式与 OpenClaw 兼容（可选）
- macOS 原生体验（后续可扩展 Windows/Linux）

## 对话模式

### 两种对话对象

**Assistant（Workspace）** — 有人格和记忆的全能助手
- 选择一个 workspace（Momo / Alice / Bob）
- 自动加载 SOUL.md / MEMORY.md / skills
- 可以调用所有工具，包括 coding agent
- 适合：复杂任务、需要决策和协调的工作

**Coding Agent（项目文件夹）** — 专注写代码的执行器
- 选择 coding agent 类型（Claude Code / Codex / Pi / OpenCode）+ 项目文件夹
- 可选：注入某个 workspace 的人格和记忆
- 直接对话，指令直达，省掉中间层
- 适合：纯代码任务、快速迭代、"别废话直接干活"的场景

### Context 注入选项

Coding agent 对话时可以选择：
- **纯净模式** — 零干扰，只写代码，省 token
- **注入模式** — 使用某个 workspace 的 SOUL.md + MEMORY.md，"懂你的代码助手"

### 实现

新建对话流程：
1. 选择对话对象
   - 📁 Workspace（列出所有 workspace）
   - 💻 Coding Agent（Claude Code / Codex / Pi / OpenCode）
2. 如果选了 Coding Agent：
   - 选择项目文件夹
   - 可选：注入哪个 workspace 的 context（或"无"）

所有对话都在一个窗口，统一的 session 列表，统一的体验。

---

## 群聊 = Multi-Agent

不做传统的 multi-agent 编排（coordinator、task 分配、auto-rotation）。

**群聊就是 multi-agent**：把多个 workspace（人）拉到同一个 session 里。

- 就像微信群：@Alice → Alice 用自己的 context 回复，@Bob → Bob 回复
- 每个 workspace 保持独立性 — 各自的 SOUL.md、MEMORY.md、skills
- 不需要 coordinator — 用户决定问谁，或者不 @ 时按规则选默认回复者
- Session 有 `participants` 字段，记录哪些 workspace 在群里

```
Session（群聊）
├── Workspace A（Alice）— 有自己的人格、记忆、技能
├── Workspace B（Bob）— 有自己的人格、记忆、技能
├── 💻 Coding Agent（可选参与者）
└── 人
```

**为什么这样做**：
- 比传统 multi-agent 简单得多：没有编排层，没有 task 系统
- 完全符合 IM 隐喻：群聊就是把人拉到一起
- 每个 workspace 作为"独立的人"参与，保持 U盘隐喻的一致性
- 未来扩展自然：workspace 可以是本地的，也可以是远程的（网络上另一台机器的 workspace）

---

## Roadmap

### Phase 1：MCP 支持 ✅ 已完成（M33）
- ✅ MCP native client（@modelcontextprotocol/sdk + stdio JSON-RPC）
- ✅ MCP 工具自动注册（mcp__{server}__{tool} 命名）
- ✅ Workspace config 声明 MCP server 连接信息
- ✅ mcp_config 对话工具（agent 可管理 MCP server）

### Phase 2：Tool 体系对齐 ✅ 大部分完成
- ✅ `skill_create` — 创建 skill 脚手架
- ✅ `web_fetch` + `web_download` — 网页抓取和下载
- ✅ `session_title_set` — AI 驱动 session 标题
- ✅ `edit` — 文件编辑工具
- ⬜ 补齐 OpenClaw 常用工具：browser、image、pdf、tts
- ⬜ Tool 安全模型完善（allowlist、approval chain）

### Phase 3：Coding Agent 作为参与者 ✅ 已完成（M38）
- ✅ Claude Code SDK 集成（real-time streaming）
- ✅ Coding Agent 从工具面板升级为对话参与者
- ✅ 1v1 对话 + 群聊 @mention 路由
- ✅ Unified workspace architecture
- ✅ CC session persistence（.paw/cc-sessions.json，app restart 后可续接）
- ✅ workspace-changed 全局事件（UI 响应式更新）

### Phase 4：存储统一（下一步，M35）
- 全局配置迁移到 ~/.paw/
- 每个 workspace 各自 sessions.db
- 启动自动迁移旧数据

### Phase 5：IM 接入（远期）
内置轻量 IM provider，Paw 开着时 workspace 可以通过外部 IM 对话：
- **Discord** — discord.js，开发者/社区场景
- **Telegram** — node-telegram-bot-api，个人/国际用户
- **飞书** — @larksuiteoapi/node-sdk，国内企业场景
- 架构：chat handler 抽象化，每个 IM 一个 provider 插件
- 限制（接受的）：Paw 关了 bot 就断，不做 24/7 常驻
