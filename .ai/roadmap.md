# Roadmap — Paw

## 当前：F203 — @mention 自动补全优化

### Phase 1：限制 @ 只在群聊触发
- [x] InputBar 接收 `isGroup` prop
- [x] 非群聊时 @ 不触发 mention dropdown
- [x] placeholder 文案区分：群聊 "Message... (@name to mention)" / 单聊 "Message..."

### Phase 2：补全 UI 升级
- [x] dropdown 每行加头像（从 workspace identity 读，复用 Avatar 组件）
- [x] fuzzy 匹配（子串 + 首字母，不区分大小写）
- [x] dropdown 位置跟随 @ 字符的光标位置
- [x] dropdown 样式对齐 taste.md（圆角 8px、主题色 border、box-shadow）

### Phase 3：pill token 体验
- [x] 选中后 @ 变成不可编辑的 inline pill（contentEditable div 或 textarea 上方的 overlay token）
- [x] pill 样式：半透明主题色背景 + 圆角 4px + 小头像 16px + 名字
- [x] Backspace 在 pill 旁边时整个删除
- [x] 发送时从 pill 提取 `@Name` 纯文本给后端

### Phase 4：消息气泡中 @Name 高亮
- [x] MessageItem 中解析 @Name，渲染为高亮 span（accent 色、半透明背景）
