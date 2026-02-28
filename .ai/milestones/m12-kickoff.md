# M12 Kickoff — 对话体验重构

## 一句话目标
对话流的工具步骤、状态展示、消息隔离做到"对的"，而不是"能跑"。

## 核心需求（不能砍）
- REQ-M12-01: 工具步骤按对话顺序内联显示，连续的折叠在一起，不堆到底部
- REQ-M12-02: 侧边栏底部状态行反映当前对话状态（不是对话流里每条消息上）
- REQ-M12-03: AI 说"写文件"就必须真的调 file_write（system prompt 引导）
- REQ-M12-04: 选 claw 目录后自动创建 memory/sessions/agents/skills 子目录

## 可延后需求
- REQ-M12-05: heartbeat 与手动对话的 requestId 彻底隔离
- REQ-M12-06: sidebar watson status 只显示系统态，普通对话状态只进卡片

## 红线
- 不能破坏已有的 streaming、multi-agent、session 持久化功能
- 不能引入新的 npm 依赖
- 工具步骤折叠后必须可展开查看

## 追求标准
- 好体验：工具步骤在对话流中自然出现，不突兀
- 好品位：参考 Claude.ai 的工具调用展示——内联、可折叠、有上下文
- 好技术：requestId 路由架构保持干净，不打补丁
