# M12 Roadmap — 对话体验重构

## F028: 工具步骤内联显示（REQ-M12-01）

### Phase 1: 数据流改造
- [x] main.js: streaming 时区分"文本块"和"工具块"，每个工具调用完成后发 `chat-tool-step` 事件（含 requestId + name + output）
- [x] main.js: 每轮新文本开始时发 `chat-text-start` 事件，让 renderer 知道"工具块结束，新文本开始"
- [x] preload.js: 暴露 `onTextStart` 回调

### Phase 2: Renderer 内联渲染
- [x] app.js: msg-card 内部用 `msg-flow` 容器替代固定的 `msg-content` + `tool-group-slot`
- [x] app.js: 收到 token → 追加到当前文本段；收到 tool-step → 插入内联工具块；收到 text-start → 创建新文本段
- [x] app.js: 连续工具调用折叠在同一个 `tool-group-inline` 里，显示"N 个工具调用"，可展开/折叠
- [x] style.css: `tool-group-inline` 样式（圆角、边框、折叠动画）

### Phase 3: 完成态
- [x] app.js: 对话完成时折叠所有内联工具组（保留可展开）
- [x] 验证：2个工具组+6个文本段，多轮分段稳定

## F029: 侧边栏 per-session 状态（REQ-M12-02）

- [x] app.js: 去掉全局 watson status，改为 per-session 状态管理（sessionStatus Map）
- [x] app.js: 每个 session-item 显示独立状态点+文字
- [x] index.html: 移除全局 watsonStatus DOM
- [x] style.css: session-item 两行布局 + session-status-dot 样式
- [x] 验证：thinking→running→done→idle 状态切换正确

## F030: system prompt 工具引导（REQ-M12-03）

- [x] main.js: buildSystemPrompt() 已有完整工具列表和使用规则（v0.12.4）
- [x] 验证：AI 正确调用 file_write 写文件

## F031: 目录自动初始化（REQ-M12-04）

- [x] main.js: select-claw-dir 已有 memory/sessions/agents/skills 初始化
- [x] main.js: create-claw-dir 补齐 sessions/agents 目录
- [x] 验证：选空目录后子目录自动创建
