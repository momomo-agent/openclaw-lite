# M32: 多 Workspace IM 体验 — Roadmap

## 目标
Paw 从单 workspace 工具变成多 workspace IM。MVP = P0 + P1（F160-F168）。

---

## Phase 0: 旧功能关闭

**F160: Feature flag 关闭旧功能** ✅ `2ea32f7`
- [x] 添加 config flag `legacyAgentFeatures: false`
- [x] Members panel（👥 按钮）：flag 关闭时隐藏入口
- [x] Task bar：flag 关闭时不渲染
- [x] Auto-rotate：flag 关闭时跳过 `onAutoRotate` 逻辑
- [x] Session agent 相关 IPC：flag 关闭时返回空/noop
- [x] 验证：启动后看不到 Members 按钮、Task bar，对话功能正常

---

## Phase 1: Workspace 身份

**F161: Workspace identity** ✅ `61ca31e`
- [x] 定义 `identity.json` schema：`{ name, avatar, description }`
- [x] 读取逻辑：`loadWorkspaceIdentity(workspacePath)` → 返回 name/avatar/description
- [x] 默认值：无 identity.json 时用文件夹名作为 name
- [x] 验证：读取已有 workspace 的 identity

**F162: Workspace 注册表** ✅ `9e9774b`
- [x] App 级配置存储 workspace 路径列表（userData/workspaces.json）
- [x] 启动时初始化 registry，当前 clawDir 自动注册
- [x] 添加/移除/创建 workspace（含脚手架）
- [x] IPC：`workspaces-list` / `workspace-add` / `workspace-remove` / `workspace-create`
- [x] 验证：CRUD 全通过

**F163: 状态隔离** ✅ `38d4edf`
- [x] `buildSystemPrompt(workspacePath?)` 接受可选 workspace 路径
- [x] SOUL.md/MEMORY.md/skills/identity 全部从 wsDir 加载
- [x] 为多 workspace 并行使用打下基础

**F164: Session-Workspace 关联** ✅ `e0ebbbe`
- [x] session store schema 增加 `workspace_id` + `owner_id` 列
- [x] `session-create` IPC 接受 `workspaceId` 参数
- [x] `sessions-list` IPC 支持按 `workspaceId` 过滤
- [x] loadSession 返回 workspaceId + ownerId

---

## Phase 2: IM 体验

**F165: Sidebar 按 workspace 分组** ✅ `eec4d68`
- [x] sidebar 渲染按 workspace 分组：每组显示头像 + 名称
- [x] 组内 session 按最近活跃排序
- [x] 无 workspace 的旧 session 归入"对话"默认组
- [x] renderSessionItem 抽取为独立函数

**F166: 新建对话选择器** ✅ `efc3e60`
- [x] 点"+"弹出 workspace 选择 overlay
- [x] 选择 workspace 后创建 session，绑定 workspaceId
- [x] 无 workspace 时直接创建未分组 session

**F167: 切换 session 自动切换 context** ✅ `f09e327`
- [x] buildSystemPrompt 自动查找当前 session 的 workspace 路径
- [x] chat header 显示 "workspace · session title"
- [x] 不同 workspace 的 session 使用各自的 context

**F168: 人员管理页** ✅ `d892407`
- [x] 管理 overlay：列出所有 workspace（头像 + 名称 + 简介）
- [x] 编辑：名称、头像(emoji)、简介
- [x] 添加：选择已有文件夹
- [x] 新建：输入名字 → 选位置 → 自动脚手架
- [x] 移除：确认弹窗，不删除文件夹

---

## Phase 3: Coding Agent + 群聊

**F169: Coding Agent 直连** ✅ `cab3a71`
- [x] coding agent 对话形式终端体验
- [x] CLI 流式渲染（stdout/stderr 实时）
- [x] Session 持久化 + 容器缓存

**F172-F175: 群聊** ✅ `cab3a71` `0c7e666` `23f96d9`
- [x] Session participants + owner（群主 = 默认回复者）
- [x] @mention 路由 → 对应 workspace context
- [x] 群主默认回复
- [x] 群成员管理（拉人/踢人）
- [x] delegate 独立气泡 + 完整 agent pipeline
- [x] session 隔离 + IM 式消息持久化

---

## Phase 4: IM 侧边栏重设计

**F176-F178: IM 风格侧边栏** ✅ `3569de0`
- [x] 移除 workspace 分组，改为扁平 IM 列表
- [x] 头像（群聊=👥，私聊=workspace avatar，无=🤖）+ 标题 + 时间
- [x] 副文本：运行中=AI status 斜体，空闲=lastMsg，群聊加 sender 前缀
- [x] 状态点：thinking=黄, running=蓝, done=绿, need_you=红, idle=隐藏
- [x] renameSession API（不改 updatedAt）
- [x] 移除 agent 编辑简介字段、📥 导出按钮

---

## 成功标准

- [x] F160-F178 全部实现
- [x] 旧功能已关闭，不可见
- [x] 可同时加载 2+ workspace，sidebar IM 风格扁平列表
- [x] 新建对话时选择跟谁说话
- [x] 切换 session 时 context 自动切换
- [x] 可编辑 workspace 的名字、头像
- [x] Coding agent 直连 + 流式渲染
- [x] 群聊：@mention 路由、群主默认回复、delegate 独立气泡
- [x] 侧边栏 IM 风格：头像+标题+时间/副文本+状态点
- [x] 现有单 workspace 对话功能无回归
