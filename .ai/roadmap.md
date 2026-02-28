# M12 Roadmap — 对话体验重构

## F028: 工具步骤内联显示（REQ-M12-01）

### Phase 1: 数据流改造
- [ ] main.js: streaming 时区分"文本块"和"工具块"，每个工具调用完成后发 `chat-tool-step` 事件（含 requestId + name + output）
- [ ] main.js: 每轮新文本开始时发 `chat-text-start` 事件，让 renderer 知道"工具块结束，新文本开始"
- [ ] preload.js: 暴露 `onTextStart` 回调

### Phase 2: Renderer 内联渲染
- [ ] app.js: msg-card 内部用 `msg-flow` 容器替代固定的 `msg-content` + `tool-group-slot`
- [ ] app.js: 收到 token → 追加到当前文本段；收到 tool-step → 插入内联工具块；收到 text-start → 创建新文本段
- [ ] app.js: 连续工具调用折叠在同一个 `tool-group-inline` 里，显示"N 个工具调用"，可展开/折叠
- [ ] style.css: `tool-group-inline` 样式（圆角、边框、折叠动画）

### Phase 3: 完成态
- [ ] app.js: 对话完成时折叠所有内联工具组（保留可展开）
- [ ] 验证：发一条触发工具调用的消息，确认工具步骤在文本中间内联显示

## F029: 侧边栏状态行（REQ-M12-02）

### Phase 1: 去掉 per-card 状态行
- [ ] app.js: 移除 card-status-line 的创建和更新逻辑
- [ ] style.css: 清理 card-status-line 相关样式

### Phase 2: watson status 反映对话状态
- [ ] app.js: 发送消息时更新 watson status 为 thinking
- [ ] app.js: 收到 tool-step 时更新为 running + 工具名
- [ ] app.js: 完成时更新为 done → 3秒后回到 idle
- [ ] 验证：发消息观察侧边栏状态变化

## F030: system prompt 工具引导（REQ-M12-03）

- [ ] main.js: buildSystemPrompt() 末尾追加完整工具列表和使用规则
- [ ] 验证：发"帮我写个报告存成 markdown"，确认 AI 调用 file_write

## F031: 目录自动初始化（REQ-M12-04）

- [ ] main.js: select-claw-dir 和 create-claw-dir 后自动 mkdirSync memory/sessions/agents/skills
- [ ] 验证：选一个空目录，确认子目录自动创建
