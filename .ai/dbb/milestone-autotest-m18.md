# M18 Auto Mode 全量测试报告

**日期:** 2026-03-02
**里程碑:** M18 轻量架构重构
**测试方式:** Playwright CDP 连接 Electron DevTools (port 9222)
**测试版本:** v0.18.1 (commit 5050290)

## 测试结果: 10/10 PASS ✅

| # | 测试项 | 结果 | 详情 |
|---|--------|------|------|
| 1 | 新建对话 | ✅ | 点击 + 按钮，sessions 2→3 |
| 2 | 设置按钮存在 | ✅ | ⚙️ 按钮可点击 |
| 3 | Agent UI | ✅ | 6 个 agent 相关按钮/面板 |
| 4 | 聊天输入框 | ✅ | textarea, placeholder="Ask anything..." |
| 5 | Console 零报错 | ✅ | 0 errors |
| 6 | 切换对话 | ✅ | 点击 session-item 切换成功 |
| 7 | 打开设置面板 | ✅ | settings panel visible=true |
| 8 | Agent 创建表单 | ✅ | Name/Soul/Model 字段齐全 |
| 9 | 空输入发送 | ✅ | 无崩溃 |
| 10 | 布局检查 | ✅ | sidebar=240px, chat=960px, 比例正常 |

## 架构验证

- ✅ 12 个 core/ 模块全部在 asar 中
- ✅ main.js 1243→936 行 (-25%)
- ✅ syncState() 桥接正常
- ✅ buildSystemPrompt 重复 task list bug 已修复

## 发现的问题

无功能性问题。

## 备注

- agent-control macOS Auto Mode 无法正确聚焦 Electron 窗口（已知限制），改用 Playwright CDP 直连
- image tool 当前不可用（model 返回空），用 Playwright evaluate 替代视觉检查
