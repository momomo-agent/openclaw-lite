# M10 Requirements — Watson Status (AI-native)

## Goal
Sidebar bottom status becomes a single glanceable line: dot + 8-14 Chinese chars.
Status copy is authored by the LLM (AI-native), not hard-coded templates.

## Requirements

| REQ | 描述 | DoD |
|-----|------|-----|
| M10-01 | 新增工具 `ui_status_set` | LLM 可调用 `ui_status_set({ level, text })` 更新侧边栏状态 |
| M10-02 | 约束：一眼读完 | `text` 强制 8-14 个中文字符（超出/不足会被拒绝并要求 LLM 重写） |
| M10-03 | 颜色语义 | level 映射到颜色：idle(灰)/thinking(黄)/running(蓝)/need_you(红)/done(绿, 2s 后回 idle) |
| M10-04 | 事件驱动（不做模板） | Main 只提供事件上下文；状态文案由 LLM 自己决定，并在关键时刻主动调用工具 |
| M10-05 | 系统提示集成 | system prompt 注入规则：重要节点（开聊/开跑工具/卡住/完成）要更新 Watson 状态 |

## DBB Scenarios
- S1: 发送普通问题，状态应从 idle -> thinking -> done -> idle
- S2: 触发工具调用（search/code_exec），状态应显示 running 的短句
- S3: 故意制造错误（缺 apiKey），状态应显示 need_you 的短句

## Non-goals
- 不做状态历史、不做可点击动作、不做多行日志面板
