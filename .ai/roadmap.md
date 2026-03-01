# M13 Roadmap — OpenClaw Memory 生态对齐

## F032: memory_get 工具
- [ ] main.js: 新增 memory_get 工具定义（name/description/input_schema）
- [ ] main.js: executeTool 里实现 memory_get — 按行读取 .md 文件，限制在 clawDir 内
- [ ] 验证：AI 调用 memory_get 读取 MEMORY.md 指定行

## F033: memory_search 工具（FTS）
- [ ] 新建 memory-index.js — SQLite + FTS5 索引管理
- [ ] memory-index.js: initIndex() — 扫描 memory/*.md + MEMORY.md，建立 FTS 索引
- [ ] memory-index.js: search(query) — FTS5 搜索，返回 {path, startLine, endLine, score, snippet}
- [ ] memory-index.js: watchAndSync() — fs.watch 检测变化，增量更新
- [ ] main.js: 新增 memory_search 工具，调用 memory-index.js
- [ ] 验证：AI 调用 memory_search 搜索记忆内容

## F034: 冷启动加载链对齐
- [ ] main.js: buildSystemPrompt() 按 OpenClaw AGENTS.md 顺序加载文件
- [ ] 加载顺序：SOUL.md → USER.md → NOW.md → AGENTS.md → IDENTITY.md → memory/INDEX.md → memory/SHARED.md → memory/SUBCONSCIOUS.md → 今天+昨天日记 → MEMORY.md → skills/
- [ ] 验证：对比 Paw 和 OpenClaw 的 system prompt 内容

## F035: Session SQLite
- [ ] 新建 session-store.js — SQLite session 存储
- [ ] session-store.js: createSession/loadSession/saveSession/listSessions/deleteSession
- [ ] main.js: 替换 JSON 文件读写为 SQLite 调用
- [ ] 迁移逻辑：启动时检测旧 JSON 文件，自动导入 SQLite
- [ ] 验证：创建/切换/删除 session 正常工作
