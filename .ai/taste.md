# Taste — Paw

## 参照物
- **Cursor** — 暗色主题、左侧对话、右侧配置的分栏布局
- **Warp** — 终端级的快速响应感，输入即反馈
- **微信/iMessage** — IM 风格的多对话切换，头像+气泡
- **Claude Desktop** — 简洁优雅的 AI 对话体验

## 视觉标准
- **5 主题系统**：dark (默认 #0a0a0a), codex, claude, light — 通过 CSS custom properties + `data-theme`
- -apple-system 字体栈
- 卡片圆角，磨砂玻璃效果 header
- 头像系统（workspace 头像 + 用户头像）

## 交互标准
- 输入框始终在底部，Enter 发送（IME 兼容）
- 回复实时 streaming，逐字出现
- Tool call 分组显示，pulse 动画表示进行中
- IM 风格侧边栏：头像 + 标题 + 副文本（状态/最后消息）
- 窗口可拖拽调整大小
- 群聊 @mention 路由
- Coding Agent 输出以对话气泡形式显示，不是独立面板
