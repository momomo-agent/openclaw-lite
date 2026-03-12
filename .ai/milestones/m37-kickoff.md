# M37 Kickoff — React 100% 对齐 main

## 目标
React 分支功能 100% 对齐 main 分支，达到完全可替换状态。M36 覆盖了 14 项核心 Feature，本里程碑补齐 M36 未覆盖的全部缺口。

## 现状（M36 之后）
M36 定义了 F220-F233 共 14 项。假设 M36 全部完成后，以下功能仍然缺失（基于逐行对比 renderer/app.js vs src/）。

---

## Feature 列表（21 项）

### P0 — 不做 = 功能残缺

| # | Feature | 说明 |
|---|---------|------|
| F234 | Settings 完整对齐 | Provider 选择器 + Base URL + Heartbeat 开关/间隔 + MCP 配置/状态 + Tavily Key + Exec Approval + Coding Agent 选择器 + Workspace 路径 + About 区域 |
| F235 | User Profile 编辑 UI | Settings 内增加头像选择器（6 预置缩略图 + 自定义上传）+ 用户名编辑 |
| F236 | Tool Display 完整覆盖 | 补齐 22 种 tool humanize（code_exec, process, memory_*, send_message, delegate_to, create/remove_agent, task_*, skill_*, claude_code, cron, notify, mcp_config, stay_silent）|
| F237 | Tool Group Round 分组 | 基于 roundInfo 的工具组分组 + purpose header + summary finalization |
| F238 | Tool Pulse 动画 | 流式进行中 tool-group-header 的 running 脉冲动画 |
| F239 | Session 自动标题 | 首条消息后自动生成智能标题（generateTitle 逻辑） |
| F240 | Auto-Rotate 群聊轮转 | triggerAgentResponse — 群聊中 agent 自动接力回复 |
| F241 | IME 输入法兼容 | InputBar 增加 e.isComposing 检测，防止中文输入时误发送 |

### P1 — 重要体验

| # | Feature | 说明 |
|---|---------|------|
| F242 | Delegate 完整性补齐 | NO_REPLY/stay_silent 检测 + 空 card 移除 + pending delegate 消息入库 + orchestrator card 分裂 |
| F243 | CC 输出面板 | 独立 `<pre>` 输出区域（last-50-lines 滚动）+ stop 按钮 + task label + expandable |
| F244 | Markdown 图片路径解析 | 自定义 marked renderer，相对路径 → file://{clawDir}/{path}；捕获 _clawDir |
| F245 | 文件拖拽上传 | 全局 dragover/drop handler + 拖拽视觉反馈 |
| F246 | 图片附件预览 | attach preview 区域显示图片缩略图（非纯文件名） |
| F247 | 用户消息内图片渲染 | image attachment 在 user card 内显示 inline `<img>` |
| F248 | File Link 点击处理 | 全局 click handler 检测 `.file-link`，按扩展名调用 openFile/openFilePreview |
| F249 | External Link 拦截 | `<a href>` http/https 链接拦截 → api.openExternal |

### P2 — 体验打磨

| # | Feature | 说明 |
|---|---------|------|
| F250 | 侧边栏拖拽调宽 | mousedown/mousemove/mouseup 拖拽 resize handle 调整侧边栏宽度 |
| F251 | Group 头像 + Sender Prefix | 侧边栏群聊 session 使用 group.png；lastMessage 带 sender prefix |
| F252 | Cmd+K 聚焦输入 | 全局 Cmd+K 快捷键聚焦 input |
| F253 | New Chat Coding Agent 区域 | workspace 选择器增加 Coding Agent 区域（codingAgentsList + engine icon） |
| F254 | Workspace 头像编辑器 | 管理面板中 workspace 编辑：6 预置缩略图 + 自定义上传 + 预览 |

---

## 执行顺序

### Round 1: Settings + Profile（F234 → F235）
Settings 是基础配置入口，当前只有 3 项，用户体验严重残缺。

### Round 2: Tool 体验（F236 → F237 → F238）
Tool display 是对话流核心视觉，缺失最明显。

### Round 3: 群聊完整性（F240 → F242 → F251）
群聊是核心场景，auto-rotate + delegate 完整性 + group 头像。

### Round 4: 消息质量（F239 → F241 → F244）
自动标题 + IME + markdown 图片 = 日常使用基本体验。

### Round 5: 文件处理（F245 → F246 → F247 → F248 → F249）
拖拽上传 → 附件预览 → 用户消息图片 → link 点击 → 外链拦截。

### Round 6: CC + 打磨（F243 → F250 → F252 → F253 → F254）
CC 输出面板 + 侧边栏调宽 + 快捷键 + coding agent + 头像编辑器。

---

## 依赖关系

```
F234 (Settings) ──→ F235 (Profile UI，需要 settings 框架)
F236 (Tool types) ──→ F237 (Round 分组) ──→ F238 (Pulse 动画)
F240 (Auto-rotate) ──→ F242 (Delegate 完整性)
F245 (拖拽) ──→ F246 (图片预览) ──→ F247 (消息内图片)
F248 (File link) ──→ F249 (External link，同一 handler 逻辑)
```

---

## Gate 标准
- [ ] Settings 面板 12 项配置全部可用
- [ ] 22 种 tool 全部有 humanize 文案
- [ ] 群聊 delegate 全链路可用（包括 NO_REPLY / stay_silent）
- [ ] 拖拽上传 + 图片预览 + 消息内图片渲染
- [ ] 文件路径 / 外部链接 点击可用
- [ ] IME 输入法无误发送
- [ ] Session 自动标题
- [ ] CC 输出面板 + stop 按钮
- [ ] 侧边栏拖拽调宽
- [ ] 与 main 分支逐功能对比零遗漏
