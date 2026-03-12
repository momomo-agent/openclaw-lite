# M36 Kickoff — React 分支对齐 main

## 目标
React 分支（React + Vite + TypeScript）完全对齐 main 分支的功能和体验，达到可替换状态。

## 现状
- react 分支有骨架：React + Vite + TypeScript + react-virtuoso + 5 主题
- 但只实现了 main 约 30-35% 的功能
- main 的 renderer/app.js 有 2770 行 86 个函数，react 所有组件加起来 525 行

## Feature 列表（14 项）

### P0 — 核心体验（不做 = 不能用）
| # | Feature | 说明 |
|---|---------|------|
| F220 | 图片头像系统 | MessageItem + Sidebar 对齐 main 的 _renderAvatar（user profile + workspace avatar） |
| F221 | Streaming 完整对齐 | 独立 onToken/onTextStart/onToolStep/onRoundInfo 监听 + inline status + thinking token |
| F222 | Delegate 多 agent 接力 | onDelegateStart/Token/End 三件套，独立气泡 + 工具步骤 + thinking |
| F223 | Session 容器隔离 | per-session 状态保留，切换不丢消息/streaming |

### P1 — 重要功能
| # | Feature | 说明 |
|---|---------|------|
| F224 | @mention 自动补全 | 输入 @ 弹下拉，键盘导航，选中插入 |
| F225 | 右键菜单 | session 重命名/删除/导出 |
| F226 | User Profile 系统 | getUserProfile/setUserProfile + 头像路径 |
| F227 | Claude Code 集成 | onCcStatus/onCcOutput 处理编码代理输出面板 |
| F228 | 错误消息 + 重试 | F209/F211 对齐：error card + retryLastMessage |
| F229 | 草稿跟随 | useDraft 接入 InputBar/ChatView，切 session 恢复草稿 |

### P2 — 体验细节
| # | Feature | 说明 |
|---|---------|------|
| F230 | linkifyPaths | 文件路径转可点击链接 |
| F231 | 导出 + 新建选择器 | exportChat markdown + workspace 选择弹窗 |
| F232 | 侧边栏搜索 + 键盘快捷键 | filterSessions + Cmd+Shift+S |
| F233 | Inline status + 主题预览 | per-card 实时状态行 + previewTheme hover |

## 执行顺序

**Round 1**: F220 → F226 → F221（头像 + profile 是基础，streaming 是核心）
**Round 2**: F223 → F222 → F227（session 隔离 → delegate → CC 集成）
**Round 3**: F228 → F229 → F224 → F225（交互功能）
**Round 4**: F230 → F231 → F232 → F233（体验打磨）

## Gate 标准
- [ ] 所有 main 分支可见的 UI 功能在 react 分支都有对应
- [ ] 图片头像（user + workspace）正常显示
- [ ] streaming + delegate + CC 全链路可用
- [ ] session 切换不丢状态
- [ ] node --check main.js 零报错
- [ ] Vite dev + production build 都通过
