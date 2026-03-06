# M20 Requirements — 工具层抽象 + Claude Code

## F068: Tool Registry 重构

### 背景
当前 16 个工具定义和执行逻辑硬编码在 main.js（~300 行），不可扩展。

### 需求
- [ ] 创建 `core/tool-registry.js`
  - `register(toolModule)` — 注册单个工具
  - `loadAll(toolsDir)` — 扫描 tools/ 目录自动注册
  - `getDefinitions()` — 返回 Anthropic 格式的工具定义数组
  - `execute(name, input, context)` — 执行工具，返回结果字符串
- [ ] 创建 `tools/` 目录
- [ ] Tool 模块接口约定：
  ```js
  module.exports = {
    name: 'tool_name',
    type: 'lightweight', // or 'persistent'
    definition: { name, description, input_schema },
    execute: async (input, context) => string
  }
  ```
- [ ] context 对象结构：`{ clawDir, sessionId, agentName, mainWindow, config, sessionStore }`
- [ ] 验证：`node --check main.js` + `node --check core/tool-registry.js`

### 设计约束
- registry 是同步扫描（启动时一次），不做热加载
- 工具名冲突时后加载的覆盖（warn log）
- skill_exec 的工具也走 registry（已有的 skill tools 注册逻辑保持兼容）

---

## F069: Tool 协议定义

### 背景
需要区分轻量工具（单次调用）和持久进程工具（长时间运行）。

### 需求
- [ ] 轻量工具协议：`{ name, type: 'lightweight', definition, execute(input, context) }`
- [ ] 持久工具协议：`{ name, type: 'persistent', definition, execute(input, context), start(context), stop(), isRunning() }`
- [ ] persistent 工具在 app quit 时自动 stop()
- [ ] registry 提供 `stopAll()` 给 app lifecycle 调用
- [ ] 验证：协议定义清晰，类型区分正确

### 设计约束
- 不引入 TypeScript，用 JSDoc 注释即可
- persistent 工具的 execute() 可以是流式的（返回 EventEmitter 或回调）

---

## F070: 轻量工具迁移

### 背景
把 main.js 的 executeTool switch 里的 16 个工具逐个提取。

### 需求
- [ ] 提取以下工具到 `tools/` 目录：
  - search.js, code_exec.js, file_read.js, file_write.js
  - shell_exec.js, notify.js, ui_status_set.js, skill_exec.js
  - memory_search.js, memory_get.js
  - task_create.js, task_update.js, task_list.js
  - send_message.js, create_agent.js, remove_agent.js
- [ ] main.js 的 executeTool 替换为 `registry.execute()`
- [ ] main.js 的 TOOLS 替换为 `registry.getDefinitions()`
- [ ] getToolsForAgent() 的过滤逻辑保持兼容
- [ ] 验证：每个工具独立可用 + 整体对话功能不变

### 设计约束
- 每个工具文件 ≤100 行
- 工具间不互相依赖（通过 context 共享状态）
- 保持现有的工具输出格式（返回 string）

---

## F071: Claude Code 工具 — 基础

### 背景
CC 是第一个 persistent 类型工具。Agent 在需要编码时调用。

### 需求
- [ ] `tools/claude_code.js`
- [ ] start(context)：spawn claude 进程，PTY 模式
  - `child_process.spawn('claude', ['--dangerously-skip-permissions'], { shell: true })`
  - 或用 node-pty 实现真正的 PTY
- [ ] execute(input)：向 stdin 写入任务，读取 stdout 直到完成标记
- [ ] stop()：SIGTERM + 等待退出 + 超时 SIGKILL
- [ ] isRunning()：检查进程状态
- [ ] 输出截断：最多保留最后 2000 字符返回给 Agent
- [ ] 验证：手动启动 CC，发送任务，收到输出

### 设计约束
- 先做最简单的版本：同步等待 CC 完成，不做流式
- CC 工作目录 = clawDir（用户的工作区）
- 超时 300 秒（5 分钟）

---

## F072: Claude Code UX

### 背景
用户需要看到 CC 的执行过程。

### 需求
- [ ] renderer 新增 CC 输出区（类似工具步骤但可以更大）
- [ ] 状态行显示：🔧 CC running / ✅ CC done / ❌ CC error
- [ ] 用户可中断（Stop 按钮 → 调用 CC stop()）
- [ ] CC 输出用 code block 渲染（monospace）
- [ ] 验证：端到端可视

### 设计约束
- CC 输出区默认展开（和普通工具不同）
- 输出实时刷新（500ms 间隔刷 DOM）
- 最大显示 50 行，超过折叠

---

## F073: Claude Code 上下文

### 背景
Agent 需要知道 CC 做了什么，并能给后续指令。

### 需求
- [ ] Agent 调用 CC 时传入：工作目录、任务描述
- [ ] CC 输出自动摘要（最后 2000 字符 + 文件变更列表）
- [ ] Agent 可连续调用 CC（同一进程，多轮对话）
- [ ] 如果 CC 进程挂了，自动重启
- [ ] 验证：Agent → CC 编码 → Agent 总结 → CC 继续

### 设计约束
- CC 进程生命周期 = session 生命周期（切换 session 时 stop）
- 不做 CC 的 session 切换（每次只有一个活跃 CC 进程）

---

## F074: 集成验证

### 验证场景
1. 现有单工具调用不受影响（file_read, shell_exec 等）
2. skill_exec 正常（registry 兼容 skill tools）
3. multi-agent 工具正常（send_message, create_agent）
4. task 系统正常（task_create, task_update, auto-rotation）
5. CC 启动/执行/停止闭环
6. Agent 委托 CC 写代码 → 结果回传
7. 用户中断 CC
8. CC 进程异常退出后恢复
