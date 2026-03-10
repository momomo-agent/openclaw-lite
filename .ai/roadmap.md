# M32: 多 Workspace IM 体验 — Roadmap

## 目标
Paw 从单 workspace 工具变成多 workspace IM。MVP = P0 + P1（F160-F168）。

---

## Phase 0: 旧功能关闭

**F160: Feature flag 关闭旧功能**
- [ ] 添加 config flag `legacyAgentFeatures: false`
- [ ] Members panel（👥 按钮）：flag 关闭时隐藏入口
- [ ] Task bar：flag 关闭时不渲染
- [ ] Auto-rotate：flag 关闭时跳过 `onAutoRotate` 逻辑
- [ ] Session agent 相关 IPC：flag 关闭时返回空/noop
- [ ] 验证：启动后看不到 Members 按钮、Task bar，对话功能正常

---

## Phase 1: Workspace 身份

**F161: Workspace identity**
- [ ] 定义 `identity.json` schema：`{ name, avatar, description }`
- [ ] workspace 文件夹内创建 `identity.json`，avatar 为相对路径指向同目录图片
- [ ] 读取逻辑：`loadWorkspaceIdentity(workspacePath)` → 返回 name/avatar/description
- [ ] 默认值：无 identity.json 时用文件夹名作为 name，默认 emoji 作为 avatar
- [ ] 验证：读取已有 workspace 的 identity

**F162: Workspace 注册表**
- [ ] App 级配置存储 workspace 路径列表（`~/.paw/workspaces.json` 或 app-level config）
- [ ] 启动时扫描所有 workspace 路径，预加载 identity + config
- [ ] 添加 workspace：选择文件夹 → 验证结构（有 SOUL.md 或 identity.json）→ 加入列表
- [ ] 移除 workspace：从列表移除（不删除文件夹）
- [ ] 新建 workspace：创建文件夹 + 脚手架文件（identity.json + SOUL.md + MEMORY.md）
- [ ] IPC：`workspaces-list` / `workspace-add` / `workspace-remove` / `workspace-create`
- [ ] 验证：添加/移除/列出多个 workspace

**F163: 状态隔离**
- [ ] 定义 `WorkspaceState` 结构：`{ id, path, identity, config, systemPrompt, sessionStore }`
- [ ] main.js：`workspaces = new Map()` 替代单例 `clawDir` / `config`
- [ ] `buildSystemPrompt(workspaceId)` — 按 workspace 加载 SOUL/MEMORY/skills
- [ ] `getApiKey(workspaceId)` — 每个 workspace 可有独立 API key（fallback 到全局）
- [ ] chat IPC：接受 `workspaceId` 参数，用对应 workspace 的 context
- [ ] 验证：两个 workspace 各自的 SOUL.md 不互相干扰

**F164: Session-Workspace 关联**
- [ ] session store schema 增加 `workspace_id` 列（TEXT，可空，兼容旧数据）
- [ ] session store schema 增加 `owner_id` 列（TEXT，可空，默认 = workspace_id）
- [ ] `session-create` IPC：接受 `workspaceId` 参数
- [ ] `sessions-list` IPC：支持按 `workspaceId` 过滤
- [ ] 旧 session 迁移：无 workspace_id 的 session 归入当前默认 workspace
- [ ] 验证：创建 session 时关联 workspace，列表可按 workspace 过滤

---

## Phase 2: IM 体验

**F165: Sidebar 按 workspace 分组**
- [ ] sidebar 渲染按 workspace 分组：每组显示头像 + 名称（可折叠）
- [ ] 组内 session 列表按最近活跃排序
- [ ] 无 workspace 的旧 session 归入"默认"分组
- [ ] workspace 头像显示：优先 identity.json 的 avatar 图片，fallback emoji
- [ ] 验证：多个 workspace 各自有 session，sidebar 正确分组

**F166: 新建对话选择器**
- [ ] 点"+"弹出选择 overlay：
  - 📁 Workspace 列表（头像 + 名称）
  - 💻 Coding Agent（选 agent 类型 + 项目文件夹）
- [ ] 选择 workspace 后创建 session，绑定 workspaceId
- [ ] 选择 coding agent 后创建 session，绑定项目路径 + agent 类型
- [ ] 验证：新建对话后 sidebar 正确归组

**F167: 切换 session 自动切换 context**
- [ ] switchSession 时读取 session 的 workspaceId
- [ ] 自动加载对应 workspace 的 system prompt / config
- [ ] chat header 显示当前 workspace 名称
- [ ] 验证：连续切换不同 workspace 的 session，context 正确

**F168: 人员管理页**
- [ ] 新 overlay：列出所有 workspace（头像 + 名称 + 简介预览）
- [ ] 编辑：点击进入编辑模式，可改名字、上传头像、编辑简介（SOUL.md）
- [ ] 添加：选择已有文件夹 或 新建（输入名字 → 自动创建文件夹 + 脚手架）
- [ ] 移除：从列表移除（确认弹窗，不删除文件夹）
- [ ] 保存：写回 identity.json + SOUL.md
- [ ] 验证：增删改查，重启后数据保持

---

## 实施顺序

F160 → F161 → F162 → F163 → F164 → F165 → F166 → F167 → F168

每个 feature 做完：`node --check main.js` + 功能验证 + 截图确认。

## 成功标准

- [ ] F160-F168 全部实现
- [ ] 旧功能已关闭，不可见
- [ ] 可同时加载 2+ workspace，sidebar 按人分组
- [ ] 新建对话时选择跟谁说话
- [ ] 切换 session 时 context 自动切换，无感
- [ ] 可编辑 workspace 的名字、头像、简介
- [ ] 现有单 workspace 对话功能无回归
