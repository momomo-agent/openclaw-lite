# M1 Kickoff — 骨架可用

## 一句话目标
选两个目录，配好 API key，能对话，能用工具。

## 核心需求（不能砍）
- REQ-M1-01: Electron 壳 + 基础窗口
- REQ-M1-02: 首次启动引导（选数据目录 + 工作区目录）
- REQ-M1-03: config.json 读写（provider/apiKey/model/baseUrl）
- REQ-M1-04: System prompt 从两个目录构建
- REQ-M1-05: 单轮对话（调 LLM，streaming 回显）
- REQ-M1-06: 多轮对话（带历史）
- REQ-M1-07: 工具调用（搜索 + 代码执行）

## 可延后需求
- REQ-M1-08: 文件工具（读写工作区文件）
- REQ-M1-09: 对话导出 markdown

## 红线
- 不引入前端框架（React/Vue），纯 HTML/CSS/JS
- 不做服务端，所有逻辑在 Electron main process
- 兼容 OpenClaw 目录结构，不发明新格式
