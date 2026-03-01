# M14 Kickoff — 记忆引擎 + 架构对齐

## 目标
把 Paw 的地基做对：目录结构对齐 OpenClaw 哲学，记忆搜索从关键词升级到本地 embedding 语义搜索，补齐 web 内容获取能力。

## 核心需求

| Feature | Backlog | 内容 | 优先级 |
|---------|---------|------|--------|
| F036 | B017 | 去掉 workspace/ 子目录，file ops cwd 改回 clawDir | P0 |
| F037 | B019 | 内部状态统一到 .paw/（sessions.db、memory-index.db） | P0 |
| F038 | B015 | Embedding memory search（node-llama-cpp + FTS5 hybrid） | P0 |
| F039 | B020 | web_fetch 工具 | P0 |
| F040 | B022 | link-understanding 消息预处理 | P0 |

## 红线
- F036/F037 必须向后兼容：旧目录结构的用户不能丢数据
- F038 本地模型优先，零 API 费用；有 OpenAI key 时可选远程 embedding
- F038 索引是缓存性质，删了能重建
- F039/F040 不能阻塞消息发送（异步抓取）
- **所有功能实现前先看 OpenClaw 源码对应模块**（`/Users/kenefe/LOCAL/momo-agent/openclaw/src/`），参考其设计和实现，取其精华

## 交付标准
- [ ] clawDir 根目录干净：只有用户关心的 .md 文件和 skills/
- [ ] .paw/ 下统一存放 sessions.db + memory-index.db
- [ ] memory_search 能语义搜索 MEMORY.md + memory/*.md
- [ ] 用户发链接时 AI 自动看到内容摘要
- [ ] web_fetch 工具可用
- [ ] 打包签名公证通过
