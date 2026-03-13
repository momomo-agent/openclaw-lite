# Roadmap — Paw

## 当前：M38 — Coding Agent 作为对话参与者 ✅ 完成

### 已完成
- [x] F255: CA Participant 数据模型
- [x] F256: 消息路由支持 CA
- [x] F257: 新建对话 CA 入口
- [x] F258: 成员管理添加 CA
- [x] F259: 清理旧 CC 面板
- [x] Claude Code SDK 集成 + real-time streaming
- [x] Unified workspace architecture
- [x] workspace-changed 全局事件（eventBus + App.tsx 全局监听）
- [x] CC session persistence（.paw/cc-sessions.json）
- [x] sidebar rename zero layout shift
- [x] 群聊历史 sender label 修复
- [x] frosted glass headers + CA sidebar 状态

### Gate 标准
- [x] 1v1 CC 对话：NewChatSelector → 发消息 → CC 气泡
- [x] 群聊 CC：添加成员 → delegate → CC 气泡
- [x] Session 续接：CC session ID 持久化到 .paw/cc-sessions.json
- [x] 向后兼容：旧 session 正常工作
- [x] `node --check main.js` 通过

---

## 下一个：M35 — 存储统一 + 体验优化（13 项）

### Round 1: 存储基础
- [ ] F200: 全局配置迁移到 ~/.paw/
- [ ] F201: 启动自动迁移
- [ ] F202: Session 存储归属（每个 workspace 各自 sessions.db）

### Round 2: 管理 + 对话流
- [ ] F205: Workspace 管理（添加/创建/删除）
- [ ] F206: Coding Agent 管理
- [ ] F207: 新建对话页修正
- [ ] F208: 冷启动页

### Round 3: 体验补齐
- [ ] F203: @mention 自动补全
- [ ] F204: 工具调用显示优化
- [ ] F209: 错误消息持久化
- [ ] F210: 输入框/附件跟随对话
- [ ] F211: 回复失败重试
- [ ] F212: Cmd+Shift+S 切换侧边栏

---

## 已完成的里程碑

| 里程碑 | 内容 | Feature 范围 |
|--------|------|-------------|
| M38 | Coding Agent 作为参与者 | F255-F259 |
| M36-M37 | React 100% 对齐 main | F220-F254 |
| M34 | UI Polish + React 迁移 | — |
| M33 | Skill Creator + MCP + Cron | F180-F191 |
| M32 | 多 Workspace IM 体验 | F160-F178 |
| M20 | 工具层抽象 + Claude Code | F061-F074 |
| M16 | Agent Team | F045-F048 |
| M1-M9 | 基础功能 | F001-F022+ |
