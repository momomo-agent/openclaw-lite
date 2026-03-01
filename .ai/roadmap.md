# M16 Roadmap — Agent Team

## F045: 共享 Task List

### Step 1: 数据层 — session-store.js 加 tasks 表
- [x] ensureSchema 新增 tasks 表：id, session_id, title, status, assignee, depends_on, created_by, created_at, updated_at
- [x] 新增 CRUD 函数：createTask / updateTask / listTasks / getTask

### Step 2: 工具层 — main.js 加 3 个 LLM 工具
- [x] task_create：创建任务（title, dependsOn?）
- [x] task_update：更新状态（taskId, status, assignee?）— 含依赖检查
- [x] task_list：返回当前 session 所有任务

### Step 3: Prompt 注入 — buildSystemPrompt 附带任务摘要
- [x] 有 tasks 时在 system prompt 末尾注入当前任务清单
- [x] 格式简洁：`[T1] ✅ done: xxx | [T2] 🔄 in-progress (agent-a): yyy | [T3] ⏳ pending (blocked by T2): zzz`

### Step 4: Renderer — 对话区任务清单 UI
- [x] IPC: session-tasks 获取任务列表
- [x] 对话区顶部显示任务清单（可折叠）
- [x] 状态颜色：pending 灰、in-progress 黄、done 绿

### Step 5: 验证
- [x] node --check main.js ✅
- [x] session-store.js require ✅
- [ ] 手动 E2E 测试（打包后验证）
- [ ] DBB 截图确认 UI
