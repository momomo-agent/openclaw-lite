# M22 Requirements — ACP 接入 Claude Code

## F085: acpx 依赖接入

### 背景
Paw 需要 acpx 作为 ACP 协议层，驱动 Claude Code 和其他 harness。

### 需求
- [ ] `npm install acpx` 加入 Paw 依赖
- [ ] 启动时检测 acpx 可用性（`require('acpx')` 或 resolve bin path）
- [ ] 如果 acpx 不可用，CC 工具注册时标记为 unavailable，不影响其他功能
- [ ] 设置面板增加 "Coding Agent" 区域：选择 harness（Claude Code / Codex / Gemini）
- [ ] 验证：`node --check main.js` + acpx 缺失时不崩溃

### 设计约束
- acpx 作为 npm 依赖，不是全局安装
- bin path 从 `node_modules/.bin/acpx` 解析
- 不引入 `@agentclientprotocol/sdk`（acpx 已封装）

---

## F086: acpx 核心封装

### 背景
封装 acpx CLI 调用为 Paw 内部 API，隐藏进程管理细节。

### 需求
- [ ] 新建 `core/acpx.js`，导出：
  ```js
  // 一次性执行
  async exec(agent, prompt, options) → { text, cost, isError }
  // 持久 session 执行
  async prompt(agent, prompt, options) → { text, cost, isError, sessionName }
  // 取消当前任务
  async cancel(agent, options) → void
  // 查看状态
  async status(agent, options) → { running, mode, ... }
  // 设置模式
  async setMode(agent, mode, options) → void
  ```
- [ ] options 结构：`{ cwd, session, timeout, format, approveAll, onOutput }`
- [ ] `onOutput(chunk)` 回调支持流式输出到 UI
- [ ] 进程管理：超时自动 kill、异常退出检测
- [ ] 验证：`exec('claude', 'echo hello')` 能返回结果

### 设计约束
- 所有 acpx 调用走 `spawn(acpxBin, args)`，不用 shell
- 输出用 `--format json` 解析 JSONL 事件
- cwd 默认 = clawDir

---

## F087: CC 工具迁移到 acpx

### 背景
把 `tools/claude-code.js` 从直接 spawn claude 改为调用 `core/acpx.js`。

### 需求
- [ ] 重写 `tools/claude-code.js`：
  - `handler` 调用 `acpx.prompt('claude', task, { cwd, onOutput })` 或 `acpx.exec`
  - 保留 `continue_session` 参数（映射到 acpx `--session`）
  - 保留输出截断逻辑（MAX_OUTPUT = 3000）
- [ ] 工具定义不变（`claude_code` 名称、参数结构）
- [ ] 删除老的 `ccProcess` / `ccSessionId` 全局状态
- [ ] `ccStop()` 改为调用 `acpx.cancel('claude')`
- [ ] 验证：Agent 调用 CC → acpx 驱动 → 结果返回 → 端到端正常

### 设计约束
- 工具名保持 `claude_code`，不改
- 用户感知不变（只是底层从 spawn claude 变成 spawn acpx claude）

---

## F088: CC UX 适配

### 背景
acpx 的输出格式和当前 PTY 方式不同，需要适配 renderer。

### 需求
- [ ] 解析 acpx JSONL 事件，映射到现有 `cc-output` / `cc-status` IPC 事件
- [ ] 支持 acpx 的 streaming 输出（逐行解析 stdout JSONL）
- [ ] CC 状态面板适配：显示 acpx session name、mode、cost
- [ ] Cancel 按钮调用 `acpx.cancel()` 而不是 `process.kill()`
- [ ] 验证：UI 显示正常 + 流式输出 + Cancel 能工作

### 设计约束
- 不改 renderer 的 CC 面板 DOM 结构，只改数据源
- 保持现有的折叠/展开行为

---

## F089: Session 管理

### 背景
acpx 支持持久 session，Paw 需要利用这个能力。

### 需求
- [ ] Paw session 切换时，保留 acpx CC session（不 kill）
- [ ] `continue_session: true` 时复用已有 acpx session
- [ ] 新建 Paw session 时，默认创建新 acpx session
- [ ] 支持 `acpx claude sessions` 查看所有 session
- [ ] app quit 时 cleanup 所有 acpx session
- [ ] 验证：切换 session → 回来 → CC 上下文还在

### 设计约束
- acpx session name = `paw-${pawSessionId}`（前缀隔离）
- 不做 session 迁移（不同 Paw workspace 的 session 不共享）

---

## F090: 多 Harness 支持

### 背景
acpx 支持多个 harness（codex、gemini 等），Paw 应该也支持。

### 需求
- [ ] 设置面板 "Coding Agent" 下拉：Claude Code / Codex / Gemini CLI
- [ ] 工具定义动态变化：选 Codex 时工具描述变成 "Delegate to Codex"
- [ ] `core/acpx.js` 的 agent 参数动态化
- [ ] 配置持久化到 `.paw/config.json`
- [ ] 验证：切换到 Codex → Agent 调用 → acpx codex 执行

### 设计约束
- 默认 Claude Code（向后兼容）
- harness 不可用时工具标记 unavailable 而不是崩溃
- 每个 session 可以独立选择 harness（未来，M22 先全局）

---

## F091: 集成验证

### 验证场景
1. Agent 调用 CC → acpx 驱动 → 结果正常返回
2. 流式输出 → UI 实时显示
3. Cancel → acpx cancel → 进程停止
4. Session 切换 → CC 上下文保留
5. 多轮对话：Agent → CC → Agent 总结 → CC 继续
6. acpx 不可用时 → 优雅降级（其他工具正常）
7. 切换 harness → Codex 可用（如果已安装）
8. 现有 16 个工具不受影响
