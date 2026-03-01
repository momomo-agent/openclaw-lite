# Paw — 需求池

> 收集需求，攒够一个里程碑再批量推进。每个里程碑走完整门禁流程。

## 待分配（Backlog）

| # | 需求 | 来源 | 优先级 | 备注 |
|---|------|------|--------|------|
| ~~B001~~ | ~~多窗口支持~~ | kenefe | P0 | ✅ M7-03 |
| ~~B002~~ | ~~设置里一键打开工作目录~~ | kenefe | P1 | ✅ M6 |
| ~~B003~~ | ~~聊天支持发送文件~~ | kenefe | P1 | ✅ M7-02 |
| ~~B004~~ | ~~Markdown 渲染优化~~ | kenefe | P1 | ✅ M6 |
| ~~B005~~ | ~~对话过程折叠~~ | kenefe | P0 | ✅ M6 |
| ~~B006~~ | ~~Discord 风格对话 UI~~ | kenefe | P0 | ✅ M6 |
| ~~B007~~ | ~~连续发消息不阻塞~~ | kenefe | P1 | ✅ M7-01 |

*(空，等新需求)*

| # | 需求 | 来源 | 优先级 | 备注 |
|---|------|------|--------|------|
| B008 | 侧边栏实时状态 | kenefe | P0 | ✅ M9+M12 已做 |
| B009 | 文件点击打开 | kenefe | P0 | ✅ M9 已做 |
| B010 | Menubar 状态展示 | kenefe | P1 | ✅ M9 已做 |
| B011 | 通知推送 | kenefe | P0 | ✅ M8 已做 |
| B012 | Cron / Heartbeat | kenefe | P0 | ✅ M8 已做（基础版） |
| B013 | Skill 完整支持 | kenefe | P1 | ✅ M8 已做 |
| B014 | 跨对话记忆同步 | kenefe | P0 | ✅ M8+M13 已做（基础版） |
| B015 | Embedding memory search | kenefe | P0 | 本地模型优先（node-llama-cpp + GGUF），零 API 费用；fallback 到 OpenAI API；包含 hybrid search（向量+FTS5）、sqlite-vec、文件监听增量索引 |
| B016 | Session transcript 纳入记忆索引 | kenefe | P1 | 对话历史可被 memory_search 搜到 |
| B017 | 去掉 workspace/ 子目录 | kenefe | P0 | file ops cwd 改回 clawDir，对齐 OpenClaw |
| B018 | OpenClaw session 导入 | kenefe | P2 | jsonl → SQLite，兼容层，不急 |
| B019 | 内部状态隐藏到 .paw/ | kenefe | P0 | memory、sessions、索引等 AI 内部文件全收进 clawDir/.paw/，不暴露给用户，防误改误删 |
| B020 | web_fetch 工具 | kenefe | P0 | 抓取网页内容转 markdown，用户发链接时 AI 能看到内容 |
| B021 | image 分析工具 | kenefe | P1 | AI 主动分析图片，独立于对话附件 |
| B022 | link-understanding | kenefe | P0 | 消息预处理：检测到 URL 自动 fetch 摘要注入上下文，AI 不用手动调工具 |
| B023 | cron 工具 | kenefe | P1 | AI 自己创建/管理定时任务 |
| B024 | context compaction | kenefe | P0 | 对话太长时自动压缩上下文 + tool_use/tool_result 配对修复 |
| B025 | exec approval | kenefe | P0 | 危险命令（shell_exec）需要用户确认才执行 |
| B026 | 工具注册插件化 | kenefe | P1 | 统一工具注册机制，加工具不用改两处代码 |
| B027 | API key rotation | kenefe | P1 | 多个 key 轮换，一个限流自动切下一个 |
| B028 | Skill 环境变量注入 | kenefe | P1 | skill 声明需要的 env，Paw 自动从设置注入，不用用户手动 export |
| B029 | Skill frontmatter 解析 | kenefe | P1 | 解析 SKILL.md 的 YAML frontmatter，支持 always/requires/os 等字段 |
| B030 | Skill 一键安装 | kenefe | P2 | 从 GitHub/npm 安装 skill，自动装依赖（brew/npm 等） |
| B031 | Skill prompt 路径压缩 | kenefe | P2 | prompt 里把绝对路径压缩成 ~/... 省 token |
| B032 | 真正的 Multi-Agent（参考 Claude Code 的 agent team 设计） | kenefe | P0 | 当前群聊是伪多agent（轮流单聊）。需要：自动轮转回复、agent间可见彼此回复、agent主动发言、后台spawn子agent、跨session通信 |
| B033 | 设置面板重构 | kenefe | P1 | 当前 380px modal 太简陋，改成侧边抽屉或全屏设置页，按分类组织（General/Provider/Tools/Memory），支撑后续功能增长 |
| B034 | Agent 管理面板重构 | kenefe | P1 | 当前 agent 列表是简单堆叠，需要：agent 卡片化展示（头像/名字/soul预览/model）、创建/编辑体验优化、agent 能力配置（工具权限/skill 绑定） |
| B035 | 文件路径可点击 | kenefe | P0 | AI 回复中的文件路径要渲染成可点击链接：图片/视频/markdown 用内置新窗口打开，其他文件用系统默认程序打开。当前文件路径只是纯文本不可点击 |

## 流程规范

- **每次里程碑完成后必须**：1) 更新官网（docs/index.html）2) 打新版 DMG + 创建 GitHub Release 支持下载最新版 3) 检查并更新 README.md

## 已分配里程碑

- M1~M5 已完成 ✅
- M6 待定
