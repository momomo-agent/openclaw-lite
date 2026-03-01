# M17: Skill Enhancement — Roadmap

## 实现顺序

### Phase 1: 基础设施（Day 1-2）

**F053: 工具注册插件化**
- 创建 `src/tools/registry.ts`
- 定义 `Tool` 接口：`{ name, description, parameters, handler }`
- 重构现有工具（`web_fetch`, `file_read`, `file_write`, `shell_exec`, `code_exec`, `search`, `skill_exec`）到 registry
- 更新 `buildSystemPrompt` 自动生成工具描述
- 更新 `handleToolUse` 自动查找 handler

**验证:**
- 所有现有工具仍然正常工作
- 添加新工具只需一处代码

---

### Phase 2: Skill 元数据（Day 2-3）

**F049: Skill Frontmatter 解析**
- 安装 `gray-matter` 库
- 创建 `src/skills/frontmatter.ts`
- 解析 frontmatter 字段：`always`, `requires`, `os`, `primaryEnv`, `emoji`, `homepage`, `skillKey`
- 创建 `SkillMetadata` 类型
- 在冷启动时扫描所有 skill 并缓存 metadata

**F051: Skill Prompt 路径压缩**
- 在 `formatSkillsForPrompt` 时替换路径
- 测试：检查 system prompt 中的路径已压缩

**验证:**
- 创建测试 skill 包含所有 frontmatter 字段
- 验证解析正确
- 验证路径压缩

---

### Phase 3: 环境变量和安装（Day 3-4）

**F050: Skill 环境变量注入**
- 扩展 `config.json` 支持 `skillEnv: Record<string, string>`
- 在 `skill_exec` 执行前读取 skill metadata 的 `primaryEnv`
- 从 `skillEnv` 读取值并注入到 `env`

**F052: Skill 安装管理**
- 创建 `src/skills/installer.ts`
- 实现 `skill_install` 工具
- 支持：`brew install`, `npm install -g`, `go install`, `uv pip install`
- 检查 `bins` 是否存在（`which`）
- 返回安装结果

**验证:**
- 创建需要 `GITHUB_TOKEN` 的 skill，验证环境变量注入
- 创建需要 `gh` 的 skill，AI 调用 `skill_install` 安装

---

### Phase 4: API 管理（Day 4-5）

**F054: API Key Rotation**
- 扩展 `config.json`：`apiKey` → `apiKeys: string[]` + `currentKeyIndex: number`
- 在 `callClaude` 时使用 `apiKeys[currentKeyIndex]`
- 捕获 429 错误，`currentKeyIndex++`，重试
- 记录每个 key 的使用统计

**验证:**
- 配置 2 个 key，第一个故意错误
- 验证自动切换到第二个
- 模拟 429 错误，验证轮换

---

### Phase 5: 集成和测试（Day 5-6）

- 所有 feature 集成测试
- 更新 README 和官网文档
- 创建 M17 status 文档

---

### Phase 6: 发布（Day 6-7）

- 更新 backlog.md（标记 B026-B031 为完成）
- 打包 v0.18.0 DMG
- 创建 GitHub Release
- 更新 docs/index.html

---

## 关键决策

1. **工具注册:** 统一机制，避免重复代码
2. **Frontmatter 解析:** 使用 `gray-matter`，标准库
3. **环境变量:** 存储在 `config.json` 的 `skillEnv` 字段
4. **安装管理:** 支持 4 种包管理器，用户确认后执行
5. **API rotation:** 自动轮换，记录统计

## 风险和缓解

| 风险 | 缓解 |
|------|------|
| Skill 安装需要 sudo | 明确提示用户，使用 exec approval |
| API rotation 导致延迟 | 限制重试次数（最多 3 次） |
| Frontmatter 解析失败 | 降级处理，忽略 frontmatter，skill 仍可用 |
| 环境变量泄露 | 不在 prompt 中显示 key 值，只显示 key 名 |

## 成功标准

- [ ] F049-F054 全部实现
- [ ] 所有现有功能仍然正常
- [ ] 新增 skill 可以声明依赖和环境变量
- [ ] AI 能自动安装 skill 依赖
- [ ] API key 自动轮换
- [ ] 文档更新完整
- [ ] v0.18.0 DMG 发布
