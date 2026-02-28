# Roadmap — M11 补齐差距

## F023 图片内联预览

### PLAN
- [ ] renderer/app.js：检测消息中的图片路径（.png/.jpg/.gif/.webp）
- [ ] 匹配到图片路径时，渲染为 `<img>` 标签（点击放大或系统打开）
- [ ] main.js：新增 IPC `read-image` 返回 base64（安全校验路径在 clawDir 内）
- [ ] 自验证：发送含图片路径的消息，确认内联显示

### 意图确认
1. 为什么：用户发文件路径时图片应直接可见，不用跳出去看
2. vision 对齐：Paw 是 AI-native 桌面助手，内联预览是基本体验
3. 技术最优解：preload 暴露 read-image IPC，renderer 用 data URL 渲染
4. 品味：图片圆角 + max-width 限制 + 点击放大
5. 根因：M9 只做了 shell.openPath，没处理内联场景

## F024 OpenAI 工具调用

### PLAN
- [ ] streamOpenAI 增加 tools 参数（转换为 OpenAI function calling 格式）
- [ ] 解析 SSE 中的 tool_calls delta（增量拼接 arguments）
- [ ] 工具执行后构建 tool role 消息继续对话（最多 5 轮）
- [ ] 自验证：用 OpenAI 兼容 provider 测试工具调用

### 意图确认
1. 为什么：OpenAI provider 用户无法使用搜索/代码执行等工具
2. vision 对齐：provider 无关的一致体验
3. 技术最优解：复用 TOOLS 定义，转换为 OpenAI functions 格式
4. 品味：工具执行过程同样展示在聊天中
5. 根因：M2 只实现了 Anthropic 的 tool loop

## F025 记忆实时 watch

### PLAN
- [ ] main.js：clawDir 确定后 fs.watch(memory/, {recursive:true}) 监听变化
- [ ] 变化时通过 IPC `memory-changed` 通知 renderer
- [ ] renderer：收到通知后在侧边栏显示"记忆已更新"提示（3s 消失）
- [ ] buildSystemPrompt 在下次对话时自动读到最新内容（已有，无需改）
- [ ] 自验证：手动改 memory/ 文件，确认 renderer 收到通知

### 意图确认
1. 为什么：多窗口/外部编辑 memory 时当前窗口感知不到变化
2. vision 对齐：跨对话记忆同步的完整闭环
3. 技术最优解：fs.watch recursive + debounce 300ms
4. 品味：轻量提示不打断对话
5. 根因：M8 只做了启动时读取

## F026 Skill 脚本执行

### PLAN
- [ ] 新增工具 `skill_exec`：input { skill, args }
- [ ] 执行逻辑：找到 clawDir/skills/{skill}/，读 SKILL.md 解析脚本路径，spawn 执行
- [ ] 安全：路径必须在 clawDir/skills/ 内，超时 30s
- [ ] 自验证：创建测试 skill，通过对话触发执行

### 意图确认
1. 为什么：LLM 知道 skill 存在但无法执行，等于只读不写
2. vision 对齐：skill 是 Paw 生态的核心扩展机制
3. 技术最优解：spawn + 路径白名单 + 超时
4. 品味：执行过程在聊天中展示（同 shell_exec）
5. 根因：M8 只注入了 SKILL.md 内容

## F027 官网更新

### PLAN
- [ ] 更新 docs/index.html 功能列表到 v0.10 全貌
- [ ] 加入 Watson 状态、多窗口、Heartbeat 等新功能描述
- [ ] 截图更新（如果有新 UI 截图）
- [ ] 自验证：本地打开确认渲染正确
