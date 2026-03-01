# Paw — Vision

> Portable AI Workspace. One folder, one assistant. Local-first, multi-agent, AI-native.

## WHY

桌面端缺一个"拿来就用"的本地 AI 工作区。现有方案要么太重（需要搭后端、装依赖），要么太轻（纯 CLI 没有 GUI）。

Paw 的定位：**零配置的本地 AI 桌面客户端**。指向一个文件夹就是一个 workspace，兼容 OpenClaw 数据格式，开箱即用。

## 核心信条

1. **一个文件夹 = 一个工作区** — config、skills、memory、sessions 全在一个目录里，可复制、可备份、可版本控制
2. **本地优先** — 数据不离开你的机器，API key 存本地，对话历史存本地
3. **AI-Native 桌面体验** — 不是网页套壳，是真正的桌面公民（tray icon、多窗口、系统通知、文件 watch）
4. **兼容 OpenClaw** — 直接指向 `~/clawd/` 或 `~/.openclaw/` 就能用，不造新格式

## 不做什么

- 不做云端同步（用户自己用 git/iCloud）
- 不做用户系统（单机单用户）
- 不做插件市场（skills 就是文件夹，手动放进去）
