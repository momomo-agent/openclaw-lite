# M8 Requirements — 基础能力层

| REQ | 描述 | 来源 | DoD |
|-----|------|------|-----|
| M8-01 | Cron / Heartbeat | B012 | 支持定时任务配置，定期触发 agent 心跳，agent 能主动工作 |
| M8-02 | Skill 完整支持 | B013 | 读取 SKILL.md 全文注入 prompt，能执行 skill 目录下的脚本 |
| M8-03 | 跨对话记忆同步 | B014 | 同一工作区多对话共享 memory/ 目录，对话产生的记忆文件实时可见 |
| M8-04 | 通知推送 | B011 | agent 能发系统通知（Electron Notification），主动找用户 |
