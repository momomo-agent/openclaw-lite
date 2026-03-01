# Paw — Taste

## 参照物

| 产品 | 学什么 |
|------|--------|
| Linear | 深色主题层次感、极简侧边栏、状态指示器 |
| Raycast | 快速启动体验、键盘优先、tray 交互 |
| Cursor | AI 对话 UI、tool call 展示、streaming 体验 |
| Bear | 侧边栏列表交互、markdown 渲染质感 |

## 视觉标准

- 背景不用纯黑 `#000`，用 `#0a0a0a`（已做到）
- 卡片/面板用亮度递增分层（#0a → #14 → #1e），不用阴影
- 文字不用纯白 `#fff`，主文字 `#e0e0e0`，次要 `#888`，禁用 `#444`
- 强调色克制，只在交互反馈时出现（链接 `#fbbf24`）
- 边框极细（1px `#ffffff08`），若有若无

## 交互标准

- 所有操作响应 < 100ms（本地操作）
- Streaming 首 token 到屏幕 < 500ms（网络延迟除外）
- 动画只用 opacity + background transition，不用位移
- 键盘快捷键：Cmd+K 聚焦输入、Cmd+Enter 发送、Cmd+Shift+N 新窗口

## 品味红线（不能出现的东西）

- 花哨的渐变背景或粒子效果
- 过大的 emoji 或图标
- 多余的 loading spinner（用 typing indicator 代替）
- 弹窗确认框（用 inline 操作代替）
- 任何"AI 味"的装饰（机器人图标除外）
