# Roadmap — M36 React 对齐 main

## Round 1: F220 图片头像系统 + F226 User Profile + F221 Streaming 完整对齐

### F220: 图片头像系统

#### Phase 1: Avatar 渲染组件
- [ ] 创建 `src/components/Avatar.tsx` — 统一头像渲染组件
  - props: `{ avatar?: string, role: 'user' | 'assistant', wsPath?: string, userProfile?: UserProfile }`
  - user role + userProfile.avatarAbsPath → `<img file://...>`
  - avatar 含 `.` + wsPath → `<img file://${wsPath}/.paw/${avatar}>`
  - avatar 纯文字 → 直接显示（emoji）
  - fallback → SVG icon（现有的 UserIcon/BotIcon）
  - onerror → fallback 到 SVG icon
- [ ] MessageItem 替换硬编码 SVG 为 `<Avatar>`
- [ ] Sidebar SessionItem 替换现有逻辑为 `<Avatar>`

#### Phase 2: 接入数据
- [ ] Store 增加 `userProfile` 状态 + `setUserProfile`
- [ ] App init 时调用 `api.getUserProfile()` 填充 store
- [ ] ChatView 传 userProfile 给 MessageList → MessageItem → Avatar
- [ ] Sidebar 已有 workspace 数据，确认 avatar 字段正确传递

### F226: User Profile 系统
- [ ] 确认 preload.js 已暴露 getUserProfile/setUserProfile/getUserAvatarPath
- [ ] Store 的 userProfile 类型对齐 types/index.ts 的 UserProfile 接口
- [ ] （如果需要）设置面板增加 User Profile 编辑区（暂不做，后续需要再加）

### F221: Streaming 完整对齐

#### Phase 1: 事件拆分
- [ ] ChatView 拆分 streaming 事件监听：
  - `api.onTextStart` → 创建新 streaming card
  - `api.onToken` → 追加 delta
  - `api.onToolStep` → 追加 tool step
  - `api.onRoundInfo` → 更新 round 信息（工具调用轮数）
- [ ] 去掉当前的 `data.type` 分流逻辑

#### Phase 2: Inline Status
- [ ] MessageItem 增加 inline status 区域（`.inline-status`）
- [ ] Streaming 中显示 "Thinking..." 动画（3 dot reading-indicator）
- [ ] 监听 `api.onUiStatus` 事件更新状态文字
- [ ] 完成后移除 inline status

#### Phase 3: Thinking Token
- [ ] Message 类型增加 `thinkingContent` 字段
- [ ] 监听 thinking token（`data.thinking === true` 的 token）
- [ ] MessageItem 渲染 thinking 折叠块（`<details>` 或自定义）

---

## Round 2-4 待本轮完成后再详细规划
