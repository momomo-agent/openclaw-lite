# Kanban — Paw 全局看板

## 当前：M23 — 单 Agent 完全可用

### P0（必做）
| Feature | 状态 | 说明 |
|---------|------|------|
| F092 冷启动修复 | ⬜ 待开始 | 没有文件夹→回冷启动页 |
| F093 Session Pruning | ⬜ 待开始 | 裁剪旧 tool results |
| F094 Compaction 升级 | ⬜ 待开始 | 动态触发 + memory flush + /compact |
| F095 Loop Detection | ⬜ 待开始 | 重复调用检测 |
| F096 edit 工具 | ⬜ 待开始 | 精确文本替换 |

### P1（体验提升）
| Feature | 状态 | 说明 |
|---------|------|------|
| F097 Exec 安全分层 | ⬜ 待开始 | allowlist + PATH 注入拒绝 |
| F098 Session 生命周期 | ⬜ 待开始 | daily/idle reset |
| F099 Heartbeat 隔离 | ⬜ 待开始 | 独立 requestId |

### P2（锦上添花）
| Feature | 状态 | 说明 |
|---------|------|------|
| F100 Scrollbar 美化 | ⬜ 待开始 | 自定义 scrollbar |
| F101 未读消息 Badge | ⬜ 待开始 | menubar badge |

## 暂停：M22 — acpx 协议接入
F085-F091 暂停，等 M23 完成后再恢复。
