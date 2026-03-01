# M1 Requirements

| REQ | 描述 | 优先级 | DoD |
|-----|------|--------|-----|
| REQ-M1-01 | Electron 壳 + 基础窗口 | P0 | 能启动，显示空白窗口，暗色主题 |
| REQ-M1-02 | 首次启动引导 | P0 | 选数据目录 + 工作区目录，路径持久化 |
| REQ-M1-03 | config.json 读写 | P0 | 从数据目录读 config.json，UI 可编辑 provider/apiKey/model |
| REQ-M1-04 | System prompt 构建 | P0 | 读 SOUL.md/MEMORY.md/AGENTS.md/skills/ 拼 system prompt |
| REQ-M1-05 | 单轮对话 | P0 | 输入问题，streaming 回显，markdown 渲染 |
| REQ-M1-06 | 多轮对话 | P0 | 带历史追问，上下文连贯 |
| REQ-M1-07 | 工具调用 | P1 | 搜索 + 代码执行，tool call 独立卡片 |
| REQ-M1-08 | 文件工具 | P2 | 读写工作区文件 |
| REQ-M1-09 | 对话导出 | P2 | 保存为 markdown |
