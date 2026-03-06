# M19: 主/轻量 Agent 分层 — Roadmap

## 实现顺序

### Phase 1: 数据层

**F061: 轻量 Agent 数据模型**
- [ ] session-store.js 新增 session_agents 表 + ensureSchema
- [ ] 新增 CRUD 函数（create/list/get/delete）
- [ ] 验证：手动调用函数，数据正确

**F062: 轻量 Agent CRUD**
- [ ] main.js 新增 IPC handlers（session-create-agent, session-list-agents, session-delete-agent）
- [ ] preload.js 暴露 API
- [ ] 新增 LLM 工具 create_agent / remove_agent
- [ ] executeTool 里处理 create_agent / remove_agent
- [ ] 验证：`node --check main.js`

---

### Phase 2: 路由层

**F063: 主 Agent 身份确立**
- [ ] chat handler：轻量 agent ID（`a` 开头）从 session_agents 加载
- [ ] 轻量 agent role → system prompt 前缀
- [ ] 验证：`node --check main.js` + 启动

**F064: 轻量 Agent 对话路由**
- [ ] renderer @mention 查找扩展：session agents → agents/ 模板
- [ ] session members 结构兼容轻量 agent
- [ ] Teammate Context 注入包含轻量 agent
- [ ] 验证：启动 + @mention 路由

---

### Phase 3: UI 层

**F065: 轻量 Agent UI**
- [ ] Members 面板"创建角色"按钮 + 表单
- [ ] 成员列表合并显示
- [ ] 从模板创建 + 删除
- [ ] 验证：UI 交互正常

---

### Phase 4: 工具适配

**F066: Agent 工具适配**
- [ ] send_message 查找扩展
- [ ] task assignee 支持轻量 agent
- [ ] auto-rotation 支持轻量 agent
- [ ] 验证：多 agent 工具联动

---

### Phase 5: 集成

**F067: 集成验证**
- [ ] 7 个验证场景全部通过
- [ ] growth.md 写记录
- [ ] backlog.md 标记 B036 完成

---

## 成功标准

- [ ] F061-F067 全部实现
- [ ] 现有单 agent 对话不受影响
- [ ] 轻量 agent 创建/对话/删除闭环
- [ ] agents/ 模板库继续工作
- [ ] `node --check main.js` 通过
- [ ] build.files 无需改动（session_agents 在 SQLite 里）
