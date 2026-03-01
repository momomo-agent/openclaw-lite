# Paw — Known Issues

### #1 — release.sh 签名流程不完整
- 级别: HIGH | 优先级: P0
- 文件: scripts/release.sh
- 状态: 🔴 待修复
- 问题: codesign --deep 不够稳、DMG srcfolder 结构可能不对、缺签名/公证验证步骤、docs/index.html 全局 sed 替换有误伤风险
- 反思: 快速出活时跳过了验证环节
- 改进: 修复后加 verify 步骤（codesign --verify + spctl + stapler validate）

### #2 — main.js 单文件 450+ 行，职责混杂
- 级别: MEDIUM | 优先级: P1
- 文件: main.js
- 状态: 🟠 计划中 (F022)
- 问题: LLM streaming、工具执行、session 管理、tray 管理全在一个文件里
- 改进: 拆成 llm.js / tools.js / sessions.js / tray.js

### #3 — shell_exec / skill_exec 同步阻塞
- 级别: MEDIUM | 优先级: P1
- 文件: main.js executeTool()
- 状态: 🟠 计划中 (F023)
- 问题: execSync 会阻塞 Electron 主进程，长命令会卡 UI
- 改进: 改 spawn + Promise 异步

### #4 — 无测试
- 级别: HIGH | 优先级: P1
- 状态: 🔴 待修复
- 问题: 整个项目零测试，工具执行、session CRUD、LLM 消息构建都没覆盖
- 改进: 加 vitest，先覆盖工具执行和 session 管理
