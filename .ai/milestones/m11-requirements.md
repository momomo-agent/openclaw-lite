# M11 Requirements — 补齐差距

## 目标
补齐 v0.10.0 已声明但未完整实现的功能差距，不加新功能。

## Feature 清单

| # | Feature | 差距描述 | 优先级 |
|---|---------|---------|--------|
| ~~F023~~ | ~~图片内联预览~~ | ~~已实现（app.js 27-44行）~~ | ✅ done |
| F024 | OpenAI 工具调用 | streamOpenAI 不支持 tool loop，只有 Anthropic 走了工具循环 | P1 |
| F025 | 记忆实时 watch | B014 记忆只在启动时读，应 fs.watch memory/ 变化时通知 renderer | P1 |
| F026 | Skill 脚本执行 | B013 只注入 SKILL.md 到 prompt，缺 skill_exec 工具让 LLM 跑脚本 | P1 |
| F027 | 官网更新 | docs/index.html 停在 M5 功能列表，需更新到 v0.10 全貌 | P2 |

## 验收标准
- 每个 feature 独立 commit，走完 PLAN→DO→REVIEW→GATE
- DBB 6/6 + E2E 对话验证
- 截图确认 UI 变化（F027）
- 最终版本 v0.11.0 + DMG + 公证 + Release
