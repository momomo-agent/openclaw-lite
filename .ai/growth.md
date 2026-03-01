# Paw — Growth Log

## v0.12.1 (2026-02-28)

- **F011 修复**: tray icon assets 未打包进 asar，导致启动即崩溃 (SIGTRAP)
- 根因: package.json build.files 漏了 `assets/**/*`
- 修复: 补 files 配置 + main.js tray 加载加防御
- 教训: 新增资源目录时必须同步更新 build.files

## v0.12.0 (2026-02-28)

- F008: Event Bus 架构上线，requestId 路由
- F009: Watson Status (侧边栏 + per-card + tray)
- F010: Tool Steps UX
- F011: Tray Icon + 菜单

## v0.11.0 (2026-02-28)

- F006: Multi-Agent
- F014: 图片附件

## v0.10.0 (2026-02-28)

- 初始版本，F001-F005 + F007 核心功能
