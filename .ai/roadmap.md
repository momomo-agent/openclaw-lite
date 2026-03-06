# M21: 核心体验打磨 — Roadmap

## 目标

CC 和多 agent 标 TBD。先把单 agent 对话体验做到"想用"的程度。
四个方向：UI 打磨、工具反馈透明化、session 管理、设置体验。

---

## Phase 1: UI 打磨

**F075: Scrollbar + 防溢出**
- [ ] 全局 scrollbar 已有基础样式，检查 chat-history 是否生效
- [ ] 代码块 `pre/code` 加 `overflow-x: auto; max-width: 100%` 防水平溢出
- [ ] 长 URL / 长单词加 `word-break: break-word`
- [ ] 验证：粘贴超长代码块、超长 URL，不出横向滚动条

**F076: 排版与对比度**
- [ ] 检查深色主题下所有文字对比度 ≥ 4.5:1（WCAG AA）
- [ ] 消息气泡间距、行高、字号统一审查
- [ ] 代码块样式：背景色区分、圆角、padding、语法高亮颜色
- [ ] timestamp 和 metadata 用更淡的颜色，不抢主要内容
- [ ] 验证：截图逐项审查

**F077: 输入区优化**
- [ ] textarea 自动增高（最多 6 行），超过后内部滚动
- [ ] Shift+Enter 换行，Enter 发送
- [ ] 发送按钮状态：空内容 disabled、发送中 loading
- [ ] 验证：多行输入、快捷键

---

## Phase 2: 工具调用反馈透明化

**F078: 多轮进度指示**
- [ ] 当前在第几轮 / 最多几轮（如 "工具调用 2/5"）
- [ ] 每轮调用了什么工具、输入摘要
- [ ] 预计耗时（基于历史平均，可选）
- [ ] 验证：触发多轮工具调用，观察进度更新

**F079: 工具步骤 UX 升级**
- [ ] 展开/折叠动画平滑（CSS transition）
- [ ] 失败步骤红色标记 + 错误摘要
- [ ] 成功步骤绿色 ✓ + 结果预览（truncated）
- [ ] 长输出折叠，点击展开全文
- [ ] 验证：成功/失败/长输出三种场景

---

## Phase 3: Session 管理

**F080: Session 基础操作**
- [ ] 右键菜单：重命名、删除、归档
- [ ] 双击 session 名称 inline 编辑
- [ ] 删除确认弹窗
- [ ] 验证：CRUD 操作

**F081: Session 搜索**
- [ ] sidebar 顶部搜索框
- [ ] 搜索 session 名称（实时过滤）
- [ ] 搜索消息内容（SQLite LIKE）
- [ ] 验证：有 10+ session 时搜索体验

**F082: Session 排序与分组**
- [ ] 默认按最近活跃排序
- [ ] 可选：按创建时间、按名称
- [ ] 可选：分组（今天 / 昨天 / 更早）
- [ ] 验证：时间分组显示

---

## Phase 4: 设置体验

**F083: 设置面板重构**
- [ ] 从当前 inline 设置改为独立设置页面或 modal
- [ ] 分 tab：General / Model / Tools / About
- [ ] General：工作区路径、主题（暂时只有 dark）
- [ ] Model：provider 选择、API key 输入（密码模式）、模型选择、温度等参数
- [ ] Tools：已启用工具列表、开关
- [ ] About：版本号、GitHub 链接
- [ ] 验证：所有设置项可正常读写

**F084: 模型切换体验**
- [ ] 下拉选择模型（支持自定义输入）
- [ ] 切换后立刻生效，不需重启
- [ ] 显示当前模型名称在 header 或 status bar
- [ ] 验证：Anthropic ↔ OpenAI 切换

---

## TBD（暂不排期）

- Claude Code 集成重做（作为 agent 而非 tool）
- 多 agent 体系重新设计
- Onboarding 引导

---

## 实现顺序

F075 → F076 → F077 → F078 → F079 → F080 → F081 → F082 → F083 → F084

每个 feature 做完自验证 + 截图对照，过了再下一个。

## 成功标准

- [ ] F075-F084 全部实现
- [ ] UI 对比度 WCAG AA
- [ ] 工具调用时用户知道在干什么
- [ ] Session 可搜索、可重命名、可删除
- [ ] 设置面板顺滑，模型切换不重启
- [ ] 现有功能无回归
