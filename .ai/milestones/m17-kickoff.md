# M17: Skill Enhancement — Kickoff

## 目标

对齐 OpenClaw 的 Skill 机制，提升 Paw 的 skill 可用性和开发体验。

## 背景

当前 Paw 的 skill 支持（M11 F016）只是基础版：读 `SKILL.md` 全文注入 prompt + `skill_exec` 工具执行。缺少：
- Frontmatter 元数据解析（`always`/`requires`/`os`/`install` 等）
- 环境变量自动注入
- 路径压缩（省 token）
- 安装管理
- 工具注册插件化

参考 OpenClaw 的实现（`src/agents/skills/frontmatter.ts` + `workspace.ts`），补齐这些能力。

## 范围

**In Scope:**
- B026: 工具注册插件化
- B027: API key rotation
- B028: Skill 环境变量注入
- B029: Skill frontmatter 解析
- B030: Skill 一键安装
- B031: Skill prompt 路径压缩

**Out of Scope:**
- Skill marketplace / 远程安装（B030 只做本地安装）
- Skill 版本管理

## 成功标准

1. Skill frontmatter 完整解析（`always`/`requires`/`os`/`install`/`primaryEnv`）
2. Skill 声明的环境变量自动从设置注入
3. Skill prompt 路径压缩（`~/...`）
4. Skill 安装命令支持（brew/npm/go/uv）
5. 工具注册统一机制（不用改两处代码）
6. API key rotation 支持多 key 轮换

## 里程碑交付物

- [ ] M17 requirements doc
- [ ] M17 roadmap
- [ ] F049-F054 实现 + 测试
- [ ] 更新 README + docs/index.html
- [ ] 打包 v0.18.0 DMG + GitHub Release

## 时间线

- Kickoff: 2026-03-01
- Target: 2026-03-08（7 天）
