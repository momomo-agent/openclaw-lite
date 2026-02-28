# Roadmap — M12 体验修复（工具过程 + 回复不显示 + scrollbar）

## 意图确认
- **根因**：三个独立问题——①token listener 全局覆盖导致多轮 tool loop 后回复写不到正确卡片 ②工具输出原文堆叠无折叠 ③系统默认 scrollbar 突兀 + 内容水平溢出
- **最优方案**：requestId 绑定（不是 hack 修 listener，而是从数据流层面保证正确性）
- **架构 vs 局部**：requestId 是架构级改动（影响 main→preload→renderer 三层），scrollbar/overflow 是局部 CSS
- **影响范围**：main.js（两个 streaming 函数）、preload.js（桥接）、app.js（渲染）、style.css（视觉）

## Phase 1: 根因修复（已完成）
- [x] main.js: 每次 chat 生成 requestId，chat-token/chat-tool-step 事件带 requestId
- [x] preload.js: 透传事件数据对象
- [x] app.js: onToken 接收 {requestId, text}，兼容旧格式 string
- [x] app.js: 工具步骤渲染到每条回复自带的 tool-group-slot（不再全局 append）

## Phase 2: 视觉修复（已完成）
- [x] style.css: 自定义 scrollbar（6px thin, 半透明）
- [x] style.css: body overflow:hidden, messages overflow-x:hidden
- [x] style.css: msg-content/md-content word-break:break-word + overflow-x:hidden
- [x] style.css: tool-group-live 样式（折叠/展开、计数、摘要）

## Phase 3: 自审 Layer 1（待做）
- [ ] Code review: 读 git diff，检查 SOLID/安全/边界条件/精简度
- [ ] 确认 build 零错误
- [ ] 确认 DBB 6/6

## Phase 4: DBB Layer 2 六维度（待做）
- [ ] 设计测试用例（正常/边界/异常/交互）
- [ ] 用 agent-control 截图验证六维度
- [ ] 出 test-results.md + 截图存 .ai/dbb/latest/

## Phase 5: Gate
- [ ] 全部通过 → 标记 [F✓][G✓]
