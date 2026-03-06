# M20: 工具层抽象 + Claude Code — Roadmap

## 目标

Agent 的行动能力可插拔。工具分两类：
- **轻量工具**：单次调用（file_write, web_fetch, search）— 现有的都是这类
- **重量工具**：持久进程（Claude Code）— 新增，agent 需要编码时调用

CC 不是 agent，是 agent 手里的工具。Agent 有 soul、记忆、人格；CC 没有。

## 实现顺序

### Phase 1: 工具注册抽象

**F068: Tool Registry 重构**
- [ ] 从 main.js 提取工具定义到 `core/tool-registry.js`
- [ ] 每个工具一个独立模块：`tools/<name>.js`，导出 `{ definition, execute }`
- [ ] tool-registry.js：扫描 tools/ 目录，自动注册
- [ ] 验证：`node --check main.js` + 启动 + 现有工具全部正常

**F069: Tool 协议定义**
- [ ] 定义 Tool 接口：`{ name, description, input_schema, type: 'lightweight' | 'persistent', execute(input, context) }`
- [ ] context 包含：clawDir, sessionId, agentName, mainWindow, config
- [ ] persistent 类型额外约定：`start(context)`, `stop()`, `isRunning()`
- [ ] 验证：类型定义 + 现有工具适配

---

### Phase 2: 现有工具迁移

**F070: 轻量工具迁移**
- [ ] 逐个提取到 tools/：search, code_exec, file_read, file_write, shell_exec, notify, ui_status_set, skill_exec, memory_search, memory_get, task_create, task_update, task_list, send_message, create_agent, remove_agent
- [ ] main.js 的 executeTool switch 替换为 registry.execute(toolName, input, context)
- [ ] 验证：所有工具功能不变

---

### Phase 3: Claude Code 集成

**F071: Claude Code 工具 — 基础**
- [ ] `tools/claude_code.js`：persistent 类型
- [ ] start()：`child_process.spawn('claude', ['--dangerously-skip-permissions', ...])` PTY 模式
- [ ] execute(input)：向 stdin 写入任务描述，收集 stdout 输出
- [ ] stop()：优雅终止进程
- [ ] 验证：手动测试创建文件

**F072: Claude Code UX**
- [ ] renderer 显示 CC 输出（streaming，类似工具步骤但持久展开）
- [ ] 状态指示：CC running / CC idle / CC error
- [ ] 用户可中断（stop 按钮）
- [ ] 验证：端到端对话 → CC 写代码 → 结果回显

**F073: Claude Code 上下文**
- [ ] Agent 调用 CC 时传入工作目录（clawDir 或用户指定）
- [ ] CC 输出摘要回传给 Agent（不是全量 stdout）
- [ ] Agent 可以给 CC 后续指令（多轮）
- [ ] 验证：Agent 发起 → CC 编码 → Agent 总结

---

### Phase 4: 集成验证

**F074: 集成验证**
- [ ] 现有单工具调用不受影响
- [ ] tool-registry 动态扫描正常
- [ ] CC 启动/执行/停止闭环
- [ ] Agent + CC 协作场景测试
- [ ] growth.md 记录

---

## 成功标准

- [ ] F068-F074 全部实现
- [ ] 工具定义从 main.js 提取到 tools/ 目录
- [ ] 新增 persistent 工具类型
- [ ] Claude Code 作为第一个 persistent 工具可用
- [ ] 现有功能无回归
- [ ] `node --check main.js` 通过
