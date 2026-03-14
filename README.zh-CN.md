<div align="center">

# bb-browser

### 坏孩子浏览器 BadBoy Browser

**你的浏览器就是 API。不需要密钥，不需要爬虫，不需要模拟。**

[![npm](https://img.shields.io/npm/v/bb-browser?color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/bb-browser)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](README.md) · [中文](README.zh-CN.md)

</div>

---

你已经登录了 Gmail、Twitter、Reddit、小红书 — bb-browser 让 AI Agent 直接用你的浏览器。不是偷 Cookie，不是伪造指纹。是**成为**浏览器本身。

```
AI Agent (Claude Code, Codex 等)
       │ CLI 命令
       ▼
bb-browser CLI ──HTTP──▶ Daemon ──SSE──▶ Chrome 扩展
                                              │
                                              ▼ chrome.debugger (CDP)
                                         你的真实浏览器
                                    (已登录的网站、Cookie、会话)
```

## 为什么

所有爬虫工具都在**假装**是浏览器。bb-browser **就是**浏览器。

| | Playwright / Selenium | 爬虫库 | bb-browser |
|---|---|---|---|
| 浏览器 | 无头、隔离环境 | 没有浏览器 | 你的真实 Chrome |
| 登录态 | 没有，要重新登录 | 偷 Cookie | 已经在了 |
| 反爬检测 | 容易被识别 | 猫鼠游戏 | 无法检测 — 它就是用户 |
| 内部系统 | 需要配 VPN/代理 | 访问不了 | 你能看到的，Agent 都能用 |

## 能做什么

### 浏览器自动化

```bash
bb-browser open https://example.com
bb-browser snapshot -i           # 只看可交互元素
bb-browser click @0              # 按 ref 点击
bb-browser fill @2 "hello"       # 填写输入框
bb-browser press Enter
bb-browser screenshot
```

### 带登录态的 Fetch

像 `curl`，但自动带上浏览器里的 Cookie 和会话。不需要 API key，不需要 token。

```bash
# Reddit — 你已经登录了，直接 fetch
bb-browser fetch https://www.reddit.com/api/me.json

# 任何网站的内部 API — 浏览器自动处理认证
bb-browser fetch https://api.example.com/user/profile --json
```

### 网络抓包

查看任何网站发送和接收的完整数据 — 请求头、请求体、响应体。相当于 Chrome DevTools 的 Network 面板，但在命令行里。

```bash
bb-browser network requests --filter "api.example.com" --with-body --json
# → 完整的请求头（包括签名 header）、完整的响应体
# → 看清一个网站的 API 是怎么工作的 — 然后为它写 adapter
```

### Site Adapters — 网站 CLI 化

为热门网站预置的命令，社区驱动，通过 [bb-sites](https://github.com/epiral/bb-sites) 维护。

```bash
bb-browser site update                                    # 安装/更新 adapter
bb-browser site reddit/thread https://reddit.com/r/...    # Reddit 讨论树
bb-browser site twitter/user yan5xu                        # Twitter 用户资料
bb-browser site xiaohongshu/feed                           # 小红书推荐 Feed
bb-browser site hackernews/top                             # HN 首页
```

> 小红书有请求签名（X-s header）。我们的 adapter 通过调用页面自己的 Vue/Pinia store action 发请求 — 页面自己签名，零逆向。

## 安装

```bash
npm install -g bb-browser
```

加载 Chrome 扩展：

1. 打开 `chrome://extensions/` → 开启开发者模式
2. 点击「加载已解压的扩展程序」→ 选 `node_modules/bb-browser/extension/`
3. 完成。

```bash
bb-browser daemon    # 启动 daemon
bb-browser status    # 确认连接
```

## 命令速查

| 分类 | 命令 | 说明 |
|------|------|------|
| **导航** | `open <url>` | 打开 URL |
| | `back` / `forward` / `refresh` | 导航 |
| | `close` | 关闭标签页 |
| **快照** | `snapshot` | 完整 DOM 树 |
| | `snapshot -i` | 只看可交互元素 |
| **交互** | `click <ref>` | 点击 |
| | `fill <ref> <text>` | 清空后填入 |
| | `type <ref> <text>` | 追加输入 |
| | `hover <ref>` | 悬停 |
| | `press <key>` | 按键（Enter, Tab, Control+a）|
| | `scroll <dir> [px]` | 滚动 |
| | `check` / `uncheck <ref>` | 复选框 |
| | `select <ref> <val>` | 下拉框 |
| **数据** | `get text <ref>` | 元素文本 |
| | `get url` / `get title` | 页面信息 |
| | `screenshot [path]` | 截图 |
| | `eval "<js>"` | 执行 JavaScript |
| **Fetch** | `fetch <url> [--json]` | 带登录态的 HTTP 请求 |
| **Site** | `site list` | 列出 adapter |
| | `site <name> [args]` | 运行 adapter |
| | `site update` | 更新社区 adapter |
| **网络** | `network requests [filter]` | 查看请求 |
| | `network requests --with-body` | 包含请求头和响应体 |
| | `network route "<url>" --abort` | 拦截请求 |
| | `network clear` | 清空记录 |
| **Tab** | `tab` | 列出标签页 |
| | `tab new [url]` | 新标签页 |
| | `tab <n>` | 切换标签页 |
| **调试** | `console` / `errors` | 控制台/JS 错误 |
| | `trace start` / `trace stop` | 录制用户操作 |
| **Daemon** | `daemon` / `stop` / `status` | 管理 daemon |

所有命令支持 `--json` 结构化输出和 `--tab <id>` 多标签页操作。

## 架构

```
bb-browser/
├── packages/
│   ├── cli/          # CLI（TypeScript，参数解析，HTTP 客户端）
│   ├── daemon/       # HTTP Daemon（SSE 桥接，请求响应匹配）
│   ├── extension/    # Chrome 扩展（Manifest V3，chrome.debugger CDP）
│   └── shared/       # 共享类型和协议定义
├── dist/             # 构建产物（npm 发布）
└── extension/        # 构建好的扩展（npm 发布）
```

| 层 | 技术栈 |
|----|--------|
| CLI | TypeScript，零依赖 |
| Daemon | Node.js HTTP + SSE |
| Extension | Chrome MV3 + `chrome.debugger` API |
| 构建 | pnpm monorepo + Turborepo + tsup + Vite |

## 许可证

[MIT](LICENSE)
