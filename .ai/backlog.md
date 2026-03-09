# Paw — 需求池

> 收集需求，攒够一个里程碑再批量推进。每个里程碑走完整门禁流程。

## 待分配（Backlog）

| # | 需求 | 来源 | 优先级 | 备注 |
|---|------|------|--------|------|
| B037 | 工具层抽象 | kenefe | P1 | Agent 的行动能力可插拔。工具分轻量（单次调用，如 file_write）和重量（持久进程，如 CC）。Paw 只定义协议。→ M20 F068-F070 |
| B038 | Claude Code 作为工具 | kenefe | P0 | 第一个持久进程类工具。Agent 在需要编码时调用 CC，CC 不是 agent，是 agent 手里的工具。依赖 B037。→ M20 F071-F073 |
| B039 | ACP 协议接入 | kenefe | P0 | 用 acpx 协议驱动 CC，替代 PTY spawn。标准化 session/cancel/steer/多 harness。→ M22 F085-F088 |
| B040 | 多 Harness 支持 | kenefe | P1 | 同一套接口支持 Claude Code/Codex/Gemini CLI。依赖 B039。→ M22 F090 |

## 已完成（✅ 已分配到里程碑）

| # | 需求 | 来源 | 优先级 | 里程碑 |
|---|------|------|--------|--------|
| B001 | 多窗口支持 | kenefe | P0 | M7 |
| B002 | 设置里一键打开工作目录 | kenefe | P1 | M6 |
| B003 | 聊天支持发送文件 | kenefe | P1 | M7 |
| B004 | Markdown 渲染优化 | kenefe | P1 | M6 |
| B005 | 对话过程折叠 | kenefe | P0 | M6 |
| B006 | Discord 风格对话 UI | kenefe | P0 | M6 |
| B007 | 连续发消息不阻塞 | kenefe | P1 | M7 |
| B008 | 侧边栏实时状态 | kenefe | P0 | M9+M12 |
| B009 | 文件点击打开 | kenefe | P0 | M9 |
| B010 | Menubar 状态展示 | kenefe | P1 | M9 |
| B011 | 通知推送 | kenefe | P0 | M8 |
| B012 | Cron / Heartbeat | kenefe | P0 | M8 |
| B013 | Skill 完整支持 | kenefe | P1 | M8 |
| B014 | 跨对话记忆同步 | kenefe | P0 | M8+M13 |
| B015 | Embedding memory search | kenefe | P0 | M14 |
| B016 | Session transcript 纳入记忆索引 | kenefe | P1 | M14 |
| B017 | 去掉 workspace/ 子目录 | kenefe | P0 | M14 |
| B019 | 内部状态隐藏到 .paw/ | kenefe | P0 | M14 |
| B020 | web_fetch 工具 | kenefe | P0 | M14 |
| B021 | image 分析工具 | kenefe | P1 | M14 |
| B022 | link-understanding | kenefe | P0 | M14 |
| B023 | cron 工具 | kenefe | P1 | M15 |
| B024 | context compaction | kenefe | P0 | M15 |
| B025 | exec approval | kenefe | P0 | M15 |
| B026 | 工具注册插件化 | kenefe | P1 | M17 |
| B027 | API key rotation | kenefe | P1 | M17 |
| B028 | Skill 环境变量注入 | kenefe | P1 | M17 |
| B029 | Skill frontmatter 解析 | kenefe | P1 | M17 |
| B030 | Skill 一键安装 | kenefe | P2 | M17 |
| B031 | Skill prompt 路径压缩 | kenefe | P2 | M17 |
| B032 | 真正的 Multi-Agent（Agent Team） | kenefe | P0 | M16 |
| B033 | 设置面板重构 | kenefe | P1 | M15 |
| B034 | Agent 管理面板重构 | kenefe | P1 | M15 |
| B035 | 文件路径可点击 | kenefe | P0 | M9 |
| B036 | 主/轻量 Agent 分层 | kenefe | P0 | M19 |

## 流程规范

- **每次里程碑完成后必须**：1) 更新官网（docs/index.html）2) 打新版 DMG + 创建 GitHub Release 支持下载最新版 3) 检查并更新 README.md

## 已分配里程碑

- M1~M5 已完成 ✅
- M6 待定
