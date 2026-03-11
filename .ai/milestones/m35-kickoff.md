# M35 Kickoff — 存储统一 + 体验优化

## 目标
统一数据存储到 ~/.paw/，修正 session 归属逻辑，补齐 IM 体验的关键缺失。

## Feature 列表（13 项）

### P0 — 存储基础（必须先做）
| # | Feature | 依赖 |
|---|---------|------|
| F200 | 全局配置迁移到 ~/.paw/ | 无 |
| F201 | 启动自动迁移 | F200 |
| F202 | Session 存储归属（每个 workspace 各自存） | F200 |

### P1 — 管理 + 对话流修正
| # | Feature | 依赖 |
|---|---------|------|
| F205 | Workspace 管理（添加/创建/删除） | F200 |
| F206 | Coding Agent 管理（添加多个，选引擎+文件夹） | F205 |
| F207 | 新建对话页修正（区分 Workspace 和 Coding Agent） | F206 |
| F208 | 冷启动页 | F205 |

### P2 — 体验补齐
| # | Feature | 依赖 |
|---|---------|------|
| F203 | @mention 自动补全 | 无 |
| F204 | 工具调用显示优化 | 无 |
| F209 | 错误消息持久化 | 无 |
| F210 | 输入框/附件跟随对话 | 无 |
| F211 | 回复失败重试 | F209 |
| F212 | Cmd+Shift+S 切换侧边栏 | 无 |

## 执行顺序

**Round 1**: F200 → F201 → F202（存储基础，其他都依赖这个）
**Round 2**: F205 → F206 → F207 → F208（管理 + 对话流）
**Round 3**: F204 → F209 → F211 → F203 → F210 → F212（体验，互相独立可并行）

## 技术方案

### F200 全局配置迁移
- `core/config.js` 的 `GLOBAL_DIR` 改为 `path.join(os.homedir(), '.paw')`
- `core/workspace-registry.js` 的 `_registryPath` 改为 `~/.paw/workspaces.json`
- `main.js` 里所有 `app.getPath('userData')` 替换为 `~/.paw/`
- prefs.json、user-avatar.png 同步迁移

### F201 启动自动迁移
- 启动时检测 `~/Library/Application Support/Paw/` 是否有旧数据
- 有则复制到 `~/.paw/`，完成后写 `~/.paw/.migrated` 标记
- 只跑一次

### F202 Session 存储归属
- 当前：所有 session 存在第一个 workspace 的 sessions.db
- 改为：每个 workspace 各自 `.paw/sessions.db`
- 群聊 session 存在群主 workspace 的 db 里
- `listSessions` 改为聚合所有 workspace 的 db
- messages metadata 已有 sender + senderWorkspaceId，不需要改

### F206 Coding Agent 管理
- coding agent 注册表存 `~/.paw/coding-agents.json`
- 结构：`[{ id, engine, projectPath, name }]`
- 启动时检测本机已装的引擎：`which claude`、`which codex`、`which pi`、`which opencode`
- 不可用的引擎灰显

## Gate 标准
- [ ] `~/.paw/` 作为唯一全局存储路径
- [ ] 旧路径自动迁移成功
- [ ] 每个 workspace 各自的 sessions.db 正常读写
- [ ] 群聊 session 存群主 workspace，消息包含完整 sender 信息
- [ ] Workspace 添加/创建/删除正常
- [ ] Coding Agent 添加/删除正常，检测本机引擎
- [ ] 新建对话页区分两类
- [ ] 冷启动引导流程完整
- [ ] 工具调用折叠显示一句话概括
- [ ] 错误消息持久化 + 重试按钮
- [ ] 输入框草稿跟 session 走
- [ ] Cmd+Shift+S 切换侧边栏
- [ ] node --check main.js 零报错
