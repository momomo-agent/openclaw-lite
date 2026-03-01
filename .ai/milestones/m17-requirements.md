# M17: Skill Enhancement — Requirements

## Features

### F049: Skill Frontmatter 解析
**优先级:** P0  
**对应 Backlog:** B029

**需求:**
- 解析 `SKILL.md` 的 YAML frontmatter（`---` 包裹）
- 支持字段：
  - `always: boolean` - 总是注入 prompt（不管是否被调用）
  - `requires: string[]` - 依赖的命令/工具
  - `os: string[]` - 支持的操作系统（`darwin`/`linux`/`win32`）
  - `primaryEnv: string` - 主要环境变量名（如 `GITHUB_TOKEN`）
  - `emoji: string` - skill 图标
  - `homepage: string` - 文档链接
  - `skillKey: string` - 唯一标识（覆盖目录名）

**实现:**
- 使用 `gray-matter` 或类似库解析 frontmatter
- 存储到 skill metadata（SQLite 或内存）
- 冷启动时扫描所有 skill 并解析

**验证:**
- 创建测试 skill 包含所有字段，验证解析正确
- `always: true` 的 skill 必须出现在 prompt 里

---

### F050: Skill 环境变量注入
**优先级:** P0  
**对应 Backlog:** B028

**需求:**
- Skill 声明 `primaryEnv: GITHUB_TOKEN`
- 执行 `skill_exec` 时，自动从 settings 读取 `GITHUB_TOKEN` 并注入到 `env`
- 支持多个环境变量（frontmatter 扩展 `env: {GITHUB_TOKEN, NPM_TOKEN}`）

**实现:**
- 在 `skill_exec` 工具执行前，读取 skill metadata 的 `primaryEnv`
- 从 `config.json` 或新增的 `skillEnv` 配置读取值
- 合并到 `child_process.spawn` 的 `env` 参数

**验证:**
- 创建需要 `GITHUB_TOKEN` 的 skill，不手动 export，验证能正常执行

---

### F051: Skill Prompt 路径压缩
**优先级:** P1  
**对应 Backlog:** B031

**需求:**
- Skill prompt 中的绝对路径压缩成 `~/...`
- 例如：`/Users/kenefe/.paw/skills/github/SKILL.md` → `~/.paw/skills/github/SKILL.md`
- 省约 5-6 tokens/skill，总共省 400-600 tokens

**实现:**
- 在 `formatSkillsForPrompt` 时，替换 `os.homedir()` 为 `~`
- 只压缩 skill 文件路径，不影响工具执行时的路径解析

**验证:**
- 检查 system prompt，确认路径已压缩
- 执行 skill 仍然正常（路径解析不受影响）

---

### F052: Skill 安装管理
**优先级:** P1  
**对应 Backlog:** B030

**需求:**
- Skill frontmatter 声明 `install` 规范：
  ```yaml
  install:
    - kind: brew
      formula: gh
      bins: [gh]
    - kind: node
      package: typescript
      bins: [tsc]
  ```
- 提供 `skill_install` 工具，AI 可调用安装依赖
- 支持：`brew` / `npm` / `go install` / `uv`

**实现:**
- 解析 `install` 字段（数组）
- `skill_install` 工具：
  - 检查 `bins` 是否存在（`which`）
  - 不存在则执行安装命令（`brew install` / `npm install -g` 等）
  - 返回安装结果

**验证:**
- 创建需要 `gh` 的 skill，AI 自动调用 `skill_install` 安装
- 安装后 skill 能正常执行

---

### F053: 工具注册插件化
**优先级:** P1  
**对应 Backlog:** B026

**需求:**
- 当前加工具需要改两处：1) `main.js` 注册工具 2) `buildSystemPrompt` 添加工具描述
- 改成统一注册机制：
  ```js
  registerTool({
    name: 'web_fetch',
    description: '...',
    parameters: {...},
    handler: async (args) => {...}
  });
  ```
- 自动生成 Anthropic tool schema + 自动注入 prompt

**实现:**
- 创建 `tools/registry.js`，维护工具列表
- `buildSystemPrompt` 自动从 registry 生成工具描述
- `handleToolUse` 自动从 registry 查找 handler

**验证:**
- 重构现有工具到 registry
- 添加新工具只需一处代码

---

### F054: API Key Rotation
**优先级:** P1  
**对应 Backlog:** B027

**需求:**
- 设置支持多个 API key（数组）
- 请求失败（429 rate limit）时自动切换下一个 key
- 记录每个 key 的使用次数和失败次数

**实现:**
- `config.json` 的 `apiKey` 改成 `apiKeys: string[]`
- 维护 `currentKeyIndex`
- 捕获 429 错误，`currentKeyIndex++`，重试请求
- 所有 key 都失败才报错

**验证:**
- 配置 2 个 key，第一个故意设置错误，验证自动切换到第二个
- 模拟 429 错误，验证轮换逻辑

---

## 非功能需求

- **性能:** Frontmatter 解析只在冷启动时执行，不影响运行时性能
- **兼容性:** 保持向后兼容，没有 frontmatter 的 skill 仍然正常工作
- **安全:** Skill 安装需要用户确认（exec approval 机制复用）

## 依赖

- M15 的 exec approval 机制（F042）
- M13 的 session SQLite（F035）

## 风险

- Skill 安装可能需要 sudo 权限（brew/npm -g），需要明确提示用户
- API key rotation 可能导致请求延迟增加（重试）
