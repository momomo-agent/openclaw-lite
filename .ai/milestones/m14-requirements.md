# M14 Requirements — 记忆引擎 + 架构对齐

## F036: 去掉 workspace/ 子目录

### 背景
v0.14.1 把 file_read/file_write/shell_exec 的 cwd 设为 `clawDir/workspace/`，与 OpenClaw 不一致。OpenClaw 直接用 workspaceDir 根目录作为 cwd。

### 需求
- [ ] file_read/file_write/shell_exec 默认 cwd 改回 clawDir
- [ ] 删除 `workspace/` 目录的初始化逻辑
- [ ] 向后兼容：如果用户已有 `workspace/` 目录且里面有文件，启动时提示或自动搬迁到根目录
- [ ] 验证：AI 写文件到 `test.md`，确认落在 clawDir 根目录

---

## F037: 内部状态统一到 .paw/

### 背景
当前 sessions.db 已在 `.paw/`，但 memory 文件、索引等散落在 clawDir 根目录。用户容易误改误删。

### 需求
- [ ] `.paw/` 目录结构设计：
  ```
  .paw/
  ├── sessions.db        # 对话存储
  ├── memory-index.db    # 记忆索引（embedding + FTS5）
  ├── config.json        # Paw 配置（从 clawDir/config.json 迁移）
  └── logs/              # 运行日志（可选）
  ```
- [ ] config.json 迁移：启动时检测 `clawDir/config.json`，自动移到 `.paw/config.json`
- [ ] 所有内部读写路径统一走 `.paw/`
- [ ] clawDir 根目录只保留用户文件：SOUL.md、USER.md、AGENTS.md、NOW.md、MEMORY.md、IDENTITY.md、TOOLS.md、HEARTBEAT.md、memory/、skills/、agents/
- [ ] 验证：新建 clawDir 后根目录无 Paw 内部文件

---

## F038: Embedding Memory Search

### 背景
当前 memory_search 是关键词匹配，对长记忆文件（MEMORY.md 几万字）搜索质量不够。需要语义搜索。

### 技术方案
- 本地模型优先：node-llama-cpp + GGUF embedding 模型（零 API 费用）
- Fallback：有 OpenAI API key 时可选 text-embedding-3-small
- 向量存储：sqlite-vec 扩展（SQLite 原生向量搜索）
- Hybrid search：向量搜索 + FTS5 关键词搜索，结果合并排序

### 需求
- [ ] 新建 `.paw/memory-index.db`，schema：
  - files 表：path, hash, mtime, size
  - chunks 表：id, file_path, start_line, end_line, text, embedding(BLOB), model
  - FTS5 虚拟表：chunks_fts(text)
- [ ] embedding-provider.js：本地模型（node-llama-cpp）+ OpenAI fallback
- [ ] memory-indexer.js：扫描 MEMORY.md + memory/**/*.md，分块 + embedding + 入库
- [ ] 增量索引：fs.watch 监听文件变化，只重新索引变化的文件（靠 hash 判断）
- [ ] memory-search.js：hybrid search（向量 cosine + FTS5 BM25），返回 {path, startLine, endLine, score, snippet}
- [ ] 冷启动：首次打开 clawDir 时后台建索引，状态栏显示进度
- [ ] main.js 的 memory_search 工具替换为新实现
- [ ] 验证：搜索"上周做了什么"能命中相关日记内容

---

## F039: web_fetch 工具

### 背景
用户说"帮我看看这个链接"，AI 没有工具能抓取网页内容。

### 需求
- [ ] 新增 web_fetch 工具：输入 URL，输出 markdown 格式的页面内容
- [ ] 实现：用 Node.js 内置 fetch + 简单 HTML→markdown 转换（cheerio/turndown）
- [ ] 限制：最大返回 50KB 文本，超出截断
- [ ] 安全：禁止 file:// 和内网 IP
- [ ] 工具定义加入 TOOLS 数组 + executeTool switch
- [ ] 验证：AI 调用 web_fetch 抓取一个公开网页

---

## F040: link-understanding 消息预处理

### 背景
OpenClaw 检测到用户消息中的 URL 会自动抓取摘要注入上下文，AI 不用手动调工具就能"看到"链接内容。

### 需求
- [ ] 消息预处理：用户发送消息前，检测文本中的 URL
- [ ] 对每个 URL 异步调用 web_fetch 获取摘要（标题 + 前 500 字）
- [ ] 将摘要作为上下文附加到用户消息中（不修改原始消息）
- [ ] 格式：`[Link context: <title> — <summary>]`
- [ ] 限制：最多处理 3 个链接，每个超时 5 秒
- [ ] 不阻塞消息发送：如果抓取超时，跳过该链接
- [ ] 验证：用户发送含链接的消息，AI 回复中体现了链接内容
