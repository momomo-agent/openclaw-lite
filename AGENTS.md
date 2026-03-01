# Paw — AGENTS.md

## 项目概述

本地 AI 桌面工作区，Electron + 纯 JS，零框架。一个文件夹 = 一个 workspace，兼容 OpenClaw 格式。

## 开发方法论

遵循 `~/clawd/docs/dev-methodology.md`，所有配套文件在 `.ai/` 目录：

| 文件 | 用途 |
|------|------|
| `.ai/vision.md` | WHY：产品定位和信条 |
| `.ai/methodology.md` | HOW：技术栈、架构、构建流程 |
| `.ai/taste.md` | TASTE：参照物和视觉/交互标准 |
| `.ai/features.json` | Feature list，只改 passes 字段 |
| `.ai/state.json` | 当前状态快照 |
| `.ai/growth.md` | 迭代日志 |
| `.ai/kanban.md` | 全局看板 |
| `.ai/known-issues.md` | 问题追踪 |
| `.ai/milestones/` | 里程碑文档 |
| `.ai/runs/` | 迭代记录 |
| `.ai/dbb/` | 体验审查 |

## 每次迭代必读

1. `.ai/vision.md` — 校准方向
2. `.ai/state.json` — 恢复记忆
3. `.ai/methodology.md` — 技术约束
4. `.ai/taste.md` — 品味标准
5. `.ai/kanban.md` — 当前进度

## 项目特殊规则

- **不引入框架** — 保持纯 HTML/CSS/JS，除非 JS 超过 2000 行
- **main.js 是主进程** — 所有后端逻辑在这里，当前 ~450 行，计划拆分
- **assets/ 必须在 build.files 里** — v0.12.0 的崩溃教训
- **发版必须签名+公证** — 不发未签名的 DMG
- **Watson Status 是 LLM 工具** — 4-20 个中文字符，AI 主动调用更新

## 构建

```bash
npm start              # 开发
npm run dist           # 构建 DMG
scripts/release.sh     # 一键发版（待修复）
```

## 签名信息

- 证书: `Developer ID Application: Kenefe Li (P2GN9QW8E5)`
- 公证: `xcrun notarytool --keychain-profile "notarytool"`
