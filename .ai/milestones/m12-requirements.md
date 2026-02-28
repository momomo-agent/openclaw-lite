# M12 Requirements

| REQ | 描述 | 优先级 | DoD |
|-----|------|--------|-----|
| REQ-M12-01 | 工具步骤内联显示 | P0 | 工具调用在对话流中按顺序出现，连续的折叠，文本在工具块前后自然衔接 |
| REQ-M12-02 | 侧边栏状态行 | P0 | 当前对话状态显示在侧边栏底部 watson status，不在对话流消息卡片上 |
| REQ-M12-03 | file_write 引导 | P0 | system prompt 明确列出所有工具及使用场景，AI 被要求写文件时必须调 file_write |
| REQ-M12-04 | 目录自动初始化 | P1 | 选 claw 目录后自动创建 memory/sessions/agents/skills |
| REQ-M12-05 | heartbeat requestId 隔离 | P2 | heartbeat 用独立 requestId，不覆盖 _activeRequestId |
| REQ-M12-06 | sidebar 状态语义分层 | P2 | 系统态(idle/heartbeat)走 sidebar，对话态走卡片 |
