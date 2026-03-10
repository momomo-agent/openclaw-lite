# M23 Status — 单 Agent 完全可用

## 看板

### 🔴 待开始
- [ ] F097 — Exec 安全分层
- [ ] F098 — Session 生命周期
- [ ] F099 — Heartbeat requestId 隔离
- [ ] F100 — Scrollbar 美化
- [ ] F101 — 未读消息计数

### 🟡 进行中
（无）

### 🟢 已完成
（无）

## 执行顺序

```
F092 冷启动修复      ──→ F096 edit 工具
                          ↓
F093 Session Pruning ──→ F094 Compaction 升级
                          ↓
F095 Loop Detection  ──→ F097 Exec 安全分层
                          ↓
                     F098 Session 生命周期
                          ↓
                     F099 Heartbeat 隔离
                          ↓
                     F100 Scrollbar + F101 Badge
```

P0 先做（F092-F096），P1 次之（F097-F099），P2 最后（F100-F101）。
