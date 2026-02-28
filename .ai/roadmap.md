# Roadmap — M10 Watson Status (AI-native)

## PLAN

- [x] 约束：状态文案由 LLM 产出；Main 不提供模板映射
- [x] 工具：`ui_status_set({ level, text })`
- [x] 校验：text 必须 8-14 字（超出/不足拒绝并要求重写）
- [x] Main：IPC `watson-status` 推送到 renderer
- [ ] Renderer：侧边栏底部接入 watson-status（点 + 8-14 字短句）
- [x] System prompt：注入 Watson rule（关键节点必须调用 ui_status_set）
- [x] done：2s 后自动回 idle（默认文案：空闲待命中）
- [ ] 自验证：
  - [ ] node --check main.js
  - [ ] DBB 6/6
  - [ ] E2E `/tmp/paw-e2e.js`
  - [ ] 截图确认“一眼短句”

## DO

- [ ] 完成 renderer 接入 + 样式细节
- [ ] 跑自验证清单并修复问题
- [ ] 更新 state.json/features.json/growth.md + 写 m10-status.md
- [ ] 打包 DMG + 创建 v0.10.0 Release
