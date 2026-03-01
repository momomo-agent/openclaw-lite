# Paw — DBB Scenarios

## S1: 首次启动
1. 用户第一次打开 Paw
2. 看到 Setup 界面，选择"Create New"或"Open Existing"
3. 选择文件夹后进入聊天界面
4. 侧边栏显示一个默认 session

## S2: 日常对话
1. 用户输入问题，按 Cmd+Enter 发送
2. 看到 typing indicator → streaming 文字 → 工具调用展开 → 完成折叠
3. Watson 状态实时更新（侧边栏 + 卡片 + tray）
4. 对话自动保存到 session

## S3: 多 Agent 协作
1. 用户创建两个 agent（不同 soul/model）
2. 在 session 里添加 agent 成员
3. 用 @name 指定对话对象
4. 不同 agent 的回复有区分

## S4: 工作区切换
1. 用户 Cmd+Shift+N 打开新窗口
2. 选择不同的工作区文件夹
3. 两个窗口独立运行，互不干扰

## S5: 错误恢复
1. API key 未配置 → 友好提示引导设置
2. 网络断开 → 错误卡片显示原因
3. 工具执行超时 → 不卡 UI，显示超时信息
