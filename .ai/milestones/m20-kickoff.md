# M20 Kickoff — 工具层抽象 + Claude Code

## 一句话目标
Agent 的行动能力从硬编码变为可插拔，Claude Code 成为第一个持久进程工具。

## 引用需求
- B037: 工具层抽象（P1）
- B038: Claude Code 作为工具（P0，依赖 B037）

## 红线
- 现有 16 个工具的功能不能回归
- 不改变用户可见的对话体验
- `node --check main.js` 必须通过
- build.files 要包含 tools/ 目录

## 范围
- F068-F074（7 个 feature）
- Phase 1-4：工具注册 → 工具迁移 → CC 集成 → 验证

## 架构审视

当前 main.js 的工具系统：
- `getAnthropicToolsArray()` 返回硬编码的工具定义数组
- `executeTool(toolName, input)` 是一个巨大的 switch/case（~200 行）
- 工具定义和执行逻辑混在 main.js 里

改造方向：
- 每个工具独立成 `tools/<name>.js`，导出 `{ definition, execute }`
- `core/tool-registry.js` 扫描 tools/ 自动注册
- main.js 的 executeTool 变成 `registry.execute(name, input, context)`
- 新增 persistent 类型，支持 start/stop/isRunning 生命周期

风险：
- 工具提取时可能遗漏 closure 里的上下文（clawDir, currentSessionId 等）→ 用 context 对象传入
- CC 的 PTY 模式在不同平台行为不同 → 先做 macOS
- CC 输出可能非常大 → 需要截断/摘要
