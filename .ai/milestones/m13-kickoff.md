# M13 Kickoff — OpenClaw Memory 生态对齐

## 一句话目标
Paw 的 memory 机制一步到位对齐 OpenClaw 源码，指向同一个 claw 目录时体验一致。

## OpenClaw Memory 架构研究结论

### 存储层
- SQLite（`node:sqlite` DatabaseSync）存储 files/chunks/embedding_cache 三张表
- memory-schema.ts 定义 schema：files(path,hash,mtime,size) + chunks(id,path,start_line,end_line,hash,model,text,embedding)
- 索引文件位置：workspace 内 `.openclaw/memory-index.sqlite`（builtin）或 `$XDG_CACHE_HOME/qmd/index.sqlite`（qmd）

### 搜索层
- hybrid search：向量搜索（sqlite-vec）+ BM25 全文搜索（FTS5）+ MMR 去重
- embedding provider：支持 openai/voyage/gemini/local(llama)
- query expansion：关键词提取辅助搜索

### 工具层
- `memory_search`：语义搜索 MEMORY.md + memory/*.md，返回 {path, startLine, endLine, score, snippet}
- `memory_get`：按行读取 .md 文件，限制在 workspace 内的 memory 路径

### 文件监听
- chokidar 监听 memory/ 目录变化
- 变化时标记 dirty，定时重新索引

### Session Transcript
- session 对话记录也可以被索引和搜索
- sync-session-files.ts 负责同步

## Paw 对齐方案

### 必须做（M13 核心）
1. **memory_search 工具** — 用 node:sqlite + FTS5 实现关键词搜索（先不做 embedding 向量搜索）
2. **memory_get 工具** — 按行读取 .md 文件，安全限制在 workspace 内
3. **SQLite 索引** — 启动时扫描 memory/*.md + MEMORY.md，建立 FTS 索引
4. **文件监听 + 增量更新** — fs.watch 检测变化，增量更新索引
5. **冷启动加载链** — 对齐 AGENTS.md 定义的顺序：SOUL.md → USER.md → NOW.md → memory/INDEX.md → memory/SHARED.md → 今天+昨天日记
6. **Session SQLite** — 对话历史从 JSON 迁移到 SQLite

### 可延后
- embedding 向量搜索（需要 API key 配置，复杂度高）
- session transcript 索引（先做 memory 文件索引）
- QMD manager 兼容

## 红线
- 不能破坏已有功能
- 目录结构必须和 OpenClaw 兼容（指向同一个 claw 目录时不冲突）
- SQLite 文件位置和 OpenClaw 一致
