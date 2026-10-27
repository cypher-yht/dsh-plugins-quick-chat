# dsh-quick-chat · 快速聊天

DeepSeek Harness（DSH）Web 界面的**悬浮聊天按钮**：右下角一个「＋」，点开就是一个独立的聊天面板，
**不打断你当前正在用的工作会话**。

> 标准 DSH bundle 插件（`cordis.patch.yml` + client 半区），装完刷新页面即生效。

## 特性

- **悬浮按钮**：贴在大肥鱼表情桌宠左侧、对齐其底部，宠物被拖动时按钮跟着走；
  找不到桌宠时回退到右下角；宠物靠左时面板自动向右翻。
- **独立面板，不抢焦点**：点「＋」弹出面板，**不切换**你当前的工作会话，主视图照旧。
- **多话题并行**：面板左上「＋」可再开一个话题，靠上方胶囊切换；每个话题各自收消息，
  可以**同时多个会话并行聊**。
- **输入体验**：Enter 发送、Shift+Enter 换行。
- **纯正文渲染**：只显示模型回复正文（无思考过程 / 工具调用），支持 Markdown
  （代码块、行内代码、粗体、链接），运行时显示「正在回复…」。
- **重启后保留对话**：话题的 `sessionId` 存在浏览器 `localStorage['dsh-quick-chat.threads.v1']`，
  下次打开自动 `retain` 回那些会话、从 DSH 会话日志重放历史；只有手动关掉话题才会移出面板。
- **会话归属当前工作区**：读主视图当前会话的 `cwd`，用 `workspaces.create({ path })` 幂等解析出
  `workspaceId`，再 `sessions.create({ workspaceId })` —— 新聊天落在你正在用的工作区里。

## 安装

```powershell
dsh plugin add github:cypher-yht/dsh-plugins-quick-chat
```

或用本地目录（开发时推荐软链，改源码即生效）：

```powershell
dsh plugin add link:D:\path\to\dsh-plugins-quick-chat
```

> 桌面客户端（Electron）读的是 `desktop` profile，不能直接用命令行 `--profile desktop`，
> 请让桌面端会话里的 `plugin_manager` 安装本插件。

装完**重启宿主**，浏览器 `Ctrl+F5` 硬刷新。

## 目录结构

```text
dsh-plugins-quick-chat/
├── index.js            # 宿主侧插件（路由 / 会话桥接）
├── client.js           # 前端：悬浮按钮 + 聊天面板
├── cordis.patch.yml    # 挂载声明
├── locale/             # 中英文案
├── icon.svg            # 插件列表图标
└── package.json
```

## 技术要点（改代码前必读）

- 客户端插件只暴露 `React.createElement / useState / useEffect`，**没有 `useRef`**；
  面板状态放在 `makePanel` 闭包里，别用 `useRef`。
- 改客户端代码后**页面不会自动换新模块**，必须刷新页面（Ctrl+R / F5）。
- 发送走 `session.prompt(..., 'queue')`；`sessions.create()` + `sessions.retain(id, {source:'gateway'})`
  拿到 `binding.eventSource`（消息流）与 `binding.session`（发送 / 运行态）。

## 许可证

MIT，见 [LICENSE](LICENSE)。
