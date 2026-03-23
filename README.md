<div align="center">

# TMAuto

### 让 AI 直接使用你已经登录的真实浏览器

**你的浏览器就是接口，不需要密钥，不需要爬虫，不需要模拟登录。**

[![npm 版本](https://img.shields.io/npm/v/bb-browser?color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/bb-browser)
[![Node.js 版本](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![许可证](https://img.shields.io/badge/许可证-MIT-blue.svg)](LICENSE)

</div>

---

`TMAuto` 基于 `bb-browser` 整理，用一套本地 CLI、MCP 服务、本地后台服务和 Chrome 扩展，把“你已经登录好的真实浏览器”直接变成 AI Agent 可以调用的能力。

你不需要额外申请网站 API，也不需要导出 Cookie，更不需要重新做一套自动化登录。只要网页能在你的浏览器里正常打开，AI 就可以在你的授权范围内直接使用它。

## 它能做什么

- 直接读取你已登录网站里的页面、接口和数据
- 让 AI 在真实浏览器里点击、输入、截图、抓包、执行脚本
- 通过 `site` 命令把网站包装成结构化数据接口
- 通过 `userscript-mcp` 做油猴脚本的生成、调试、回归和导出

例如：

```bash
bb-browser site twitter/search "AI agent"       # 搜索推文
bb-browser site zhihu/hot                        # 查看知乎热榜
bb-browser site arxiv/search "transformer"       # 搜索论文
bb-browser site eastmoney/stock "茅台"            # 查看实时股票行情
bb-browser site boss/search "AI 工程师"           # 搜索职位
bb-browser site wikipedia/summary "Python"       # 获取词条摘要
bb-browser site youtube/transcript VIDEO_ID      # 获取视频字幕全文
bb-browser site stackoverflow/search "async"     # 搜索技术问答
```

目前已经支持 **36 个平台、103 个命令**，完整站点能力列表见 [bb-sites](https://github.com/epiral/bb-sites)。

## 它和常见方案有什么不同

传统自动化方案通常有两个问题：

- 无头浏览器没有你的真实登录态，很多网站要重新登录
- 抓取方案容易被风控、验证码、接口签名和页面框架细节卡住

`TMAuto` 的思路不是让网站额外开放接口，而是让 AI 直接使用人的界面和浏览器运行环境。网页看到的就是你自己，所以很多本来很难自动化的已登录场景会简单很多。

| 对比项 | 常见自动化 / 爬取 | TMAuto |
|---|---|---|
| 浏览器环境 | 独立、无状态 | 你的真实浏览器 |
| 登录态 | 需要重登或手动注入 | 直接复用 |
| 风控识别 | 容易触发 | 更贴近真实用户 |
| 网页内部能力 | 常要自己逆向 | 可以直接调用页面环境 |

## 安装

```bash
npm install -g bb-browser
```

安装后可直接使用以下命令：

```bash
bb-browser site update
bb-browser site recommend
bb-browser site zhihu/hot
```

## 三种使用方式

### 1. 通过 OpenClaw 使用

如果你在使用 [OpenClaw](https://openclaw.ai)，可以直接复用 OpenClaw 内置浏览器，不需要额外安装扩展和后台服务：

```bash
bb-browser site reddit/hot --openclaw
bb-browser site xueqiu/hot-stock 5 --openclaw --jq '.items[] | {name, changePercent}'
```

### 2. 通过 Chrome 扩展和后台服务使用

如果你要在本地命令行、Claude Code、Codex、Cursor 等环境里使用：

1. 从 [Releases](https://github.com/wintopic/TMAuto/releases/latest) 下载扩展压缩包
2. 解压后打开 `chrome://extensions/`
3. 打开“开发者模式”
4. 点击“加载已解压的扩展程序”
5. 选择解压后的扩展目录
6. 启动本地后台服务

```bash
bb-browser daemon
```

也可以直接启动独立入口：

```bash
bb-browser-daemon
```

### 3. 通过 MCP 接入 AI 工具

如果你要把它接到支持 MCP 的工具里，可以使用下面的配置：

```json
{
  "mcpServers": {
    "bb-browser": {
      "command": "npx",
      "args": ["-y", "bb-browser", "--mcp"]
    }
  }
}
```

## 常用命令

### 浏览器操作

```bash
bb-browser open https://example.com
bb-browser snapshot -i
bb-browser click @3
bb-browser fill @5 "hello"
bb-browser type @5 " world"
bb-browser press Enter
bb-browser scroll down 800
bb-browser screenshot
```

### 页面调试与抓包

```bash
bb-browser eval "document.title"
bb-browser fetch https://example.com/api/me --json
bb-browser network requests --with-body --json
bb-browser console
bb-browser errors
bb-browser trace start
bb-browser trace stop
```

### 标签页与导航

```bash
bb-browser tab list
bb-browser tab new https://example.com
bb-browser back
bb-browser forward
bb-browser refresh
bb-browser status
```

所有命令都支持 `--json` 输出，很多命令支持 `--jq` 做结果过滤。

## 站点命令

`site` 是最适合 AI 使用的入口。它把网站能力封装成结构化命令，输出更稳定，也更适合自动化处理。

常用流程如下：

```bash
bb-browser site update                  # 更新社区站点适配器
bb-browser site recommend               # 基于浏览历史推荐可用适配器
bb-browser site list                    # 查看全部适配器
bb-browser site info xueqiu/stock       # 查看参数、示例、域名
bb-browser site zhihu/hot               # 直接运行
```

社区适配器仓库：

- [bb-sites](https://github.com/epiral/bb-sites)

## 油猴脚本开发流程

如果你要让 AI 生成、调试和验证 userscript，可以使用专用的 MCP 服务：

```bash
bb-browser-userscript-mcp
```

推荐流程：

1. 运行 `userscript_doctor` 检查浏览器、daemon、扩展和 `chrome.userScripts`
2. 用 `userscript_generate_from_page` 或 `userscript_project_init` 初始化项目
3. 用 `userscript_dev_run` 自动构建、安装、打开页面并收集日志
4. 用 `userscript_regression_run` 进行回归验证
5. 用 `userscript_export_tampermonkey` 或 `userscript_publish_local` 导出成品

## Daemon 配置

默认情况下，本地后台服务监听 `localhost:19824`。你也可以自定义监听地址：

```bash
bb-browser daemon --host 127.0.0.1    # 仅使用 IPv4
bb-browser daemon --host 0.0.0.0      # 允许局域网或 Tailscale 场景访问
```

## 架构

```text
AI Agent（Codex、Claude Code、Cursor 等）
        │
        │ CLI 或 MCP
        ▼
bb-browser CLI ──HTTP──▶ Daemon ──SSE──▶ Chrome 扩展
                                               │
                                               ▼
                                     chrome.debugger（CDP）
                                               │
                                               ▼
                                          你的真实浏览器
```

## 隐私与安全

这个项目默认在本机运行，核心通信链路是本地的：

```text
AI Agent ↔ CLI/MCP ↔ localhost:19824 ↔ Chrome 扩展
```

- 默认没有遥测、没有云端转发
- 页面内容、抓包结果、Trace 记录主要保存在本地运行时内存中
- 是否访问某个网站、是否执行某个命令，完全由你自己控制

详细说明见：

- [PRIVACY.md](PRIVACY.md)
- [SECURITY.md](SECURITY.md)

## 开发与贡献

本地开发：

```bash
corepack pnpm install
corepack pnpm lint
corepack pnpm test
corepack pnpm verify
```

贡献流程和仓库约定见：

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## 许可证

[MIT](LICENSE)
