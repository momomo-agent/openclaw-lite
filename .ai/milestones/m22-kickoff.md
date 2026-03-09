# M22 Kickoff — ACP 接入 Claude Code

## 一句话目标
用 acpx 协议驱动 Claude Code，替代当前 PTY spawn 方式，获得 session 管理、cancel、steer、多 harness 支持。

## 为什么做

当前 M20 的 CC 集成（`tools/claude-code.js`）的问题：
1. **直接 spawn claude 进程** — 没有 session 管理，每次调用要么新建要么靠 `--resume` 手动续
2. **JSON stdout 解析脆弱** — `--print --output-format json` 模式下，stderr 和 stdout 混杂
3. **没有 cancel/steer** — 进程启动后只能等完或 SIGKILL
4. **只支持 Claude Code** — 换 Codex/Gemini 要重写一套

acpx 提供的：
- **标准 session 管理** — `acpx claude prompt` 持久 session，`acpx claude exec` 一次性
- **cancel** — `acpx claude cancel` 协作式取消
- **set-mode** — 运行时切换 plan/code 模式
- **多 harness** — `acpx codex` / `acpx gemini` 同一套接口
- **流式输出** — `--format json` 标准化 JSONL 事件流
- **权限控制** — `--approve-all` / `--approve-reads` / `--deny-all`

## 架构

```
Paw Electron App
  └── tools/claude-code.js（重写）
        └── spawn acpx claude [prompt|exec|cancel|status]
              └── Claude Code 进程（acpx 管理生命周期）
```

不引入 OpenClaw Gateway。Paw 直接 spawn `acpx` CLI，跟当前 spawn `claude` 一样简单，但获得标准协议能力。

## 红线
- 现有非 CC 工具功能不能回归
- 对话体验至少不低于当前 PTY CC
- `node --check main.js` 必须通过
- 不依赖 OpenClaw Gateway

## 范围
- F085-F091（7 个 feature）
- Phase 1-4：acpx 集成 → CC 迁移 → UX 升级 → 多 harness

## 前置条件
- `npx acpx --version` 可用（npm 全局或 npx）
- Claude Code CLI 已安装（`~/.local/bin/claude`）
