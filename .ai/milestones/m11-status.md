# M11 Status — 补齐差距

## Gate Checklist
- [x] node --check main.js ✅
- [x] DBB 6/6 ✅
- [ ] E2E 对话验证
- [ ] 截图确认
- [x] features.json 更新（F024-F027）
- [x] state.json 更新
- [x] version bump 0.11.0

## Feature 完成情况
| # | Feature | Status |
|---|---------|--------|
| F024 | OpenAI 工具调用 | ✅ streamOpenAI 加入 function calling + tool loop（最多5轮） |
| F025 | 记忆实时 watch | ✅ fs.watch(memory/, recursive) + debounce 300ms + IPC memory-changed |
| F026 | Skill 脚本执行 | ✅ skill_exec 工具，cwd=skills/{name}，路径白名单，30s 超时 |
| F027 | 官网更新 | ✅ docs/index.html 更新到 v0.10 全貌（8 feature 卡片 + 公证说明） |

## 待完成
- [ ] E2E 验证
- [ ] 打包 DMG + 公证
- [ ] 创建 Release v0.11.0
