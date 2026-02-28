# Roadmap — M10 Watson Status (AI-native)

## PLAN (don't implement yet)

- [ ] 明确约束：状态文案必须由 LLM 产出；Main 不提供模板映射
- [ ] 设计工具：`ui_status_set({ level, text })`
- [ ] 校验规则：text 8-14 字（中文为主，允许数字/符号但计入长度）
- [ ] Main：新增 IPC `watson-status` 推送到 renderer
- [ ] Renderer：侧边栏底部替换为 Watson 状态组件（点+短句）
- [ ] LLM Loop：
      - 在 system prompt 增加一条铁律：重要时刻要调用 `ui_status_set`
      - 在 tool loop 中允许 LLM 调用 `ui_status_set`
- [ ] done 语义：done 后 2s 自动回 idle（不需要 LLM 再设置）
- [ ] 自验证：
      - node --check main.js
      - DBB 6/6
      - E2E `/tmp/paw-e2e.js`
      - agent-control --pid 截图确认侧边栏短句符合长度

## DO (implement it all, mark completed, don't stop)
(ready after PLAN review)
