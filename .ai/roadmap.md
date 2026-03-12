# Roadmap — React 100% 对齐 main

## M36 (已规划): 核心骨架 14 项

### Round 1: F220 图片头像 + F226 User Profile + F221 Streaming
- [ ] F220: Avatar 组件 + 数据接入
- [ ] F226: User Profile store + API
- [ ] F221: onToken/onTextStart/onToolStep/onRoundInfo 拆分 + inline status + thinking

### Round 2: F223 Session 隔离 + F222 Delegate + F227 CC
- [ ] F223: per-session 状态保留
- [ ] F222: Delegate 三件套（start/token/end）
- [ ] F227: CC status/output 面板

### Round 3: F228 错误重试 + F229 草稿 + F224 @mention + F225 右键菜单
- [ ] F228: error card + retry
- [ ] F229: useDraft 接入
- [ ] F224: @mention 自动补全
- [ ] F225: 右键菜单

### Round 4: F230 linkify + F231 导出 + F232 搜索快捷键 + F233 inline status
- [ ] F230: linkifyPaths
- [ ] F231: export + workspace 选择
- [ ] F232: sidebar 搜索 + Cmd+Shift+S
- [ ] F233: per-card status + theme preview

---

## M37: 补齐全部缺口 21 项

### Round 5: Settings 完整对齐（F234 → F235）
- [ ] F234: Settings 12 项配置
  - [ ] Provider 选择器（anthropic / openai）
  - [ ] Base URL 输入
  - [ ] Heartbeat 开关 + 间隔
  - [ ] MCP 服务器 JSON 配置 + 重连按钮
  - [ ] MCP 状态显示（per-server connected/tool count）
  - [ ] Tavily API Key
  - [ ] Exec Approval 开关
  - [ ] Coding Agent 选择器
  - [ ] Workspace 路径显示 + Change 按钮
  - [ ] Open in Finder 按钮
  - [ ] About 区域（logo + version + links）
  - [ ] auto-save on close（去掉 save 按钮）
- [ ] F235: User Profile 编辑 UI
  - [ ] 当前头像 48×48 预览
  - [ ] 6 个预置缩略图点击选择
  - [ ] 自定义上传（hidden file input）
  - [ ] 用户名输入
  - [ ] 调用 setUserProfile / setWorkspaceAvatar API

### Round 6: Tool 体验（F236 → F237 → F238）
- [ ] F236: 补齐 22 种 tool humanize
  - [ ] code_exec → "运行代码"
  - [ ] process → "执行命令"
  - [ ] memory_get / memory_set / memory_list → "读取/写入/列出记忆"
  - [ ] send_message → "发送消息给 {target}"
  - [ ] delegate_to → "委派给 {agent}"
  - [ ] create_agent / remove_agent → "创建/移除 agent"
  - [ ] task_create / task_update / task_list → "创建/更新/列出任务"
  - [ ] skill_exec / skill_create / skill_install → "执行/创建/安装技能"
  - [ ] claude_code → "调用 Claude Code"
  - [ ] cron → "设置定时任务"
  - [ ] notify → "发送通知"
  - [ ] mcp_config → "配置 MCP"
  - [ ] stay_silent → "保持沉默"
- [ ] F237: Tool Group Round 分组
  - [ ] 监听 roundInfo 创建新 tool-group
  - [ ] group header 显示 purpose text
  - [ ] group 完成后 finalize summary
- [ ] F238: Tool Pulse 动画
  - [ ] streaming 中 tool-group-header 脉冲动画（CSS @keyframes）
  - [ ] 完成后停止动画

### Round 7: 群聊完整性（F240 → F242 → F251）
- [ ] F240: Auto-Rotate 群聊轮转
  - [ ] triggerAgentResponse 逻辑
  - [ ] onAutoRotate 事件监听
  - [ ] 轮转时创建新 streaming card
- [ ] F242: Delegate 完整性补齐
  - [ ] NO_REPLY / stay_silent 检测
  - [ ] 空 card 自动移除
  - [ ] pending delegate 消息队列入库
  - [ ] orchestrator card 分裂（post-delegate text split）
  - [ ] delegate 内 thinking token 渲染
  - [ ] delegate 内 tool step 渲染
- [ ] F251: Group 头像 + Sender Prefix
  - [ ] 侧边栏群聊 session 使用 group.png
  - [ ] lastMessage 带 sender name prefix（`senderName: text`）
  - [ ] stripMd() 用于 sidebar 预览

### Round 8: 消息质量（F239 → F241 → F244）
- [ ] F239: Session 自动标题
  - [ ] generateTitle() — 从首条用户消息智能提取标题
  - [ ] chat 完成后检测是否需要标题
  - [ ] 更新 session title + sidebar 刷新
- [ ] F241: IME 输入法兼容
  - [ ] InputBar onKeyDown 增加 e.isComposing 检测
  - [ ] compositionstart / compositionend 事件监听
- [ ] F244: Markdown 图片路径解析
  - [ ] 捕获 _clawDir 到 store
  - [ ] 自定义 marked image renderer
  - [ ] 相对路径 → `file://{clawDir}/{path}`

### Round 9: 文件处理（F245 → F246 → F247 → F248 → F249）
- [ ] F245: 文件拖拽上传
  - [ ] 全局 dragover/dragenter/dragleave/drop handler
  - [ ] 拖拽视觉反馈（overlay + border highlight）
  - [ ] drop 后添加到 attachments state
- [ ] F246: 图片附件预览
  - [ ] attach preview 区域：图片类型显示缩略图
  - [ ] 非图片类型显示文件名 chip
- [ ] F247: 用户消息内图片渲染
  - [ ] user card 内 image attachment 渲染 inline `<img>`
  - [ ] 点击可放大（可选）
- [ ] F248: File Link 点击处理
  - [ ] 全局 click delegate 检测 `.file-link` / `data-file-path`
  - [ ] 按扩展名区分 openFile vs openFilePreview
- [ ] F249: External Link 拦截
  - [ ] `<a href>` http/https 链接 → 阻止默认 + api.openExternal
  - [ ] 安全过滤（只允许 http/https）

### Round 10: 打磨（F243 → F250 → F252 → F253 → F254）
- [ ] F243: CC 输出面板
  - [ ] 独立 `<pre>` 输出区域
  - [ ] last-50-lines 滚动截断
  - [ ] Stop 按钮（api.ccStop）
  - [ ] task label + expandable toggle
- [ ] F250: 侧边栏拖拽调宽
  - [ ] mousedown on resize handle → 开始拖拽
  - [ ] mousemove → 更新 sidebar width（clamp min/max）
  - [ ] mouseup → 结束拖拽
  - [ ] 宽度持久化到 localStorage
- [ ] F252: Cmd+K 聚焦输入
  - [ ] 全局 keydown listener Cmd+K → focus textarea
- [ ] F253: New Chat Coding Agent 区域
  - [ ] api.codingAgentsList() 获取可用 coding agents
  - [ ] 渲染引擎图标 + 名称列表
  - [ ] 点击创建 coding session
- [ ] F254: Workspace 头像编辑器
  - [ ] 管理面板 workspace 编辑增加头像区
  - [ ] 6 预置缩略图 + 自定义上传
  - [ ] 调用 api.setWorkspaceAvatar({ id, presetIndex / customPath })
  - [ ] 保存后刷新面板 + 侧边栏

---

## Gate 标准（M36 + M37 合计）
- [ ] Settings 面板 12 项配置全部可用
- [ ] User Profile 编辑可用（头像 + 名称）
- [ ] 22 种 tool 全部有 humanize 文案
- [ ] Tool group round 分组 + pulse 动画
- [ ] 群聊 delegate 全链路（含 NO_REPLY / stay_silent / auto-rotate）
- [ ] Session 自动标题
- [ ] IME 输入法无误发送
- [ ] 拖拽上传 + 图片预览 + 消息内图片
- [ ] 文件路径 / 外部链接 点击可用
- [ ] Markdown 相对图片路径解析
- [ ] CC 输出面板 + stop 按钮
- [ ] 侧边栏拖拽调宽
- [ ] Cmd+K 聚焦
- [ ] New Chat Coding Agent 区域
- [ ] Workspace 头像编辑器
- [ ] 与 main 分支逐功能对比零遗漏
- [ ] Vite dev + production build 都通过
