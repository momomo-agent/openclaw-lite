# M18: 轻量架构重构

## 核心原则

**Paw 是工具，不是平台。**

- 一个 Electron app，一个文件夹，零配置
- 拆文件，不拆服务
- 保持便携和轻量，不引入进程间通信
- 重构后 main.js 从 1243 行降到 ~200 行（仅胶水代码）

## 为什么做

main.js 1243 行，包含：配置加载、链接提取、context 压缩、API 调用、记忆索引、session 管理、agent 管理、工具定义、工具执行、窗口创建、IPC 处理、prompt 构建、LLM streaming（Anthropic + OpenAI）、heartbeat、通知、tray 菜单。

**问题：**
1. 改一处容易误伤其他地方（M17 教训：改工具系统忘加 build.files）
2. 无法单独测试任何模块
3. 新功能只能往 main.js 里塞
4. 全局变量满天飞（mainWindow, clawDir, currentSessionId...）

## 不做什么

- ❌ 不拆 Orchestrator 为独立服务
- ❌ 不加 HTTP API 层
- ❌ 不做 iOS/Web 客户端
- ❌ 不引入 TypeScript（保持 JS，降低门槛）
- ❌ 不改变数据格式（保持 OpenClaw 兼容）

## 拆分方案

### 当前 main.js 职责 → 目标文件

| 职责 | 当前行数 | 目标文件 |
|------|----------|----------|
| 配置加载 | ~30 | `core/config.js` |
| 链接提取 | ~30 | `core/link-extract.js` |
| Context 压缩 | ~50 | `core/compaction.js` |
| API Key Rotation | ~30 | `core/api-keys.js` |
| LLM Raw 调用 | ~60 | `core/llm-raw.js` |
| 记忆索引 + 监听 | ~40 | `core/memory-watch.js` |
| Session CRUD | ~10 | (已有 session-store.js) |
| Agent CRUD | ~30 | `core/agents.js` |
| 工具定义（内置） | ~50 | `core/builtin-tools.js` |
| 工具执行 | ~150 | `core/tool-executor.js` |
| 窗口创建 + Prefs | ~80 | `core/window.js` |
| IPC 处理 | ~100 | `core/ipc-handlers.js` |
| System Prompt 构建 | ~120 | `core/prompt-builder.js` |
| Anthropic Streaming | ~80 | `core/stream-anthropic.js` |
| OpenAI Streaming | ~100 | `core/stream-openai.js` |
| Heartbeat | ~30 | `core/heartbeat.js` |
| 通知 + Status | ~20 | `core/notify.js` |
| Tray 菜单 | ~40 | `core/tray.js` |
| **main.js 胶水** | **~200** | `main.js` |

**总计:** 18 个模块，main.js 只剩 ~200 行（require + app.ready + 状态初始化）

### 共享状态方案

当前全局变量：
```javascript
let mainWindow
let clawDir = null
let currentSessionId = null
let currentAgentName = null
let heartbeatTimer = null
let tray = null
```

**方案：AppState 单例**
```javascript
// core/state.js
const state = {
  mainWindow: null,
  clawDir: null,
  currentSessionId: null,
  currentAgentName: null,
  heartbeatTimer: null,
  tray: null,
  _trayStatusText: '空闲待命中'
};

module.exports = state;
```

所有模块通过 `require('./core/state')` 读写状态，不用全局变量。

## Features

| ID | 名称 | 说明 |
|----|------|------|
| F055 | AppState 单例 | 提取全局变量到 core/state.js |
| F056 | 核心模块拆分 | config/compaction/api-keys/llm-raw/agents |
| F057 | Prompt Builder 独立 | 提取 buildSystemPrompt 到 core/prompt-builder.js |
| F058 | Streaming 独立 | 提取 streamAnthropic/streamOpenAI 到独立文件 |
| F059 | IPC 独立 | 提取 IPC handlers 到 core/ipc-handlers.js |
| F060 | 集成验证 | main.js 精简到 ~200 行，全功能不变 |

## 验证标准

每个 Feature 完成后：
1. `node --check main.js` 通过
2. `npm start` 能正常启动
3. 能发消息、收到回复、工具调用正常
4. 多窗口正常
5. Heartbeat 正常
6. Tray 菜单正常

F060 完成后追加：
7. 构建 DMG，验证 asar 包含所有新文件
8. 启动打包产物测试

## 实施顺序

```
F055 (state) → F056 (核心模块) → F057 (prompt) → F058 (streaming) → F059 (IPC) → F060 (验证)
```

逐步迁移，每步都能运行。不一次性重写。
