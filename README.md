<div align="center">

# TMAuto

### 让 AI 直接使用你已经登录的真实浏览器

**你的浏览器就是接口，不需要密钥，不需要爬虫，不需要模拟登录。**

[![npm 版本](https://img.shields.io/npm/v/bb-browser?color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/bb-browser)
[![构建状态](https://github.com/wintopic/TMAuto/actions/workflows/ci.yml/badge.svg)](https://github.com/wintopic/TMAuto/actions/workflows/ci.yml)
[![Node.js 版本](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![许可证](https://img.shields.io/badge/许可证-MIT-blue.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/wintopic/TMAuto?style=social)](https://github.com/wintopic/TMAuto/stargazers)

[快速开始](#快速开始) · [使用方式选择](#使用方式选择) · [常用命令](#常用命令) · [项目结构](#项目结构) · [隐私与安全](#隐私与安全) · [开发与贡献](#开发与贡献)

</div>

---

> `TMAuto` 基于 `bb-browser` 整理，把本地 `CLI`、`MCP` 服务、本地后台服务和 Chrome 扩展串成一条完整链路，让 AI 在你的授权范围内直接读取页面、操作界面、抓取结果并执行自动化流程。

如果网页已经在你的浏览器里正常打开，`TMAuto` 就会尽量复用这份真实运行环境，而不是重新造一个脱离登录态的无头环境。你不需要额外申请网站 `API`，不需要导出 `Cookie`，也不需要重新搭一套模拟登录流程。

## 为什么用它

- 已登录场景可以直接复用浏览器状态，不必重复处理登录流
- 不依赖站点公开 `API`，也不要求手动导出 `Cookie`
- 同时适合人直接在命令行使用，也适合接给 AI 代理和支持 `MCP` 的工具
- 既能做结构化站点查询，也能做真实浏览器自动化和 `userscript` 开发

## 它能做什么

- 直接读取你已登录网站里的页面、接口和数据
- 让 AI 在真实浏览器里点击、输入、截图、抓包、执行脚本
- 通过 `site` 命令把网站能力包装成结构化接口
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

## 适合这些场景

- 读取知乎、雪球、招聘站、知识库、论文站等已登录或强交互页面数据
- 让 AI 辅助完成后台录入、运营操作、信息核对、页面巡检
- 把高频网页能力封装成稳定命令，再交给 Codex、Claude Code、Cursor 等工具调用
- 生成和调试 Tampermonkey 脚本，把一次性网页操作沉淀成可复用自动化

## 和常见方案有什么不同

传统自动化方案通常会遇到两个问题：

- 无头浏览器没有你的真实登录态，很多网站要重新登录
- 抓取方案容易被风控、验证码、接口签名和页面框架细节卡住

`TMAuto` 的思路不是让网站额外开放接口，而是让 AI 直接使用人的界面和浏览器运行环境。网页看到的就是你自己，所以很多原本很难自动化的已登录场景会简单很多。

| 对比项 | 常见自动化 / 爬取 | TMAuto |
| --- | --- | --- |
| 浏览器环境 | 独立、无状态 | 你的真实浏览器 |
| 登录态 | 需要重登或手动注入 | 直接复用 |
| 风控识别 | 容易触发 | 更贴近真实用户 |
| 网页内部能力 | 常常需要自己逆向 | 可以直接调用页面环境 |
| 接入方式 | 脚本分散、流程割裂 | `CLI`、`MCP`、扩展、`daemon` 一体化 |

## 快速开始

### 环境要求

- `Node.js 18+`
- Chrome 或兼容 `chrome.debugger` 的 Chromium 内核浏览器
- 如果要参与仓库开发，建议启用 `corepack` 并使用 `pnpm`

### 安装

```bash
npm install -g bb-browser
```

安装后可以先运行下面三条命令确认环境正常：

```bash
bb-browser site update
bb-browser site recommend
bb-browser site zhihu/hot
```

## 使用方式选择

如果你只想尽快体验站点能力，优先使用 `site` 命令；如果你要做本机浏览器自动化，使用 Chrome 扩展加 `daemon`；如果你要接入支持 `MCP` 的 AI 工具，使用 `MCP` 服务入口。

### 方式一：通过 OpenClaw 使用

如果你在使用 [OpenClaw](https://openclaw.ai)，可以直接复用 OpenClaw 内置浏览器，不需要额外安装扩展和后台服务：

```bash
bb-browser site reddit/hot --openclaw
bb-browser site xueqiu/hot-stock 5 --openclaw --jq '.items[] | {name, changePercent}'
```

### 方式二：通过 Chrome 扩展和后台服务使用

如果你要在本地命令行、Codex、Claude Code、Cursor 等环境里使用，请按下面步骤准备：

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

### 方式三：通过 MCP 接入 AI 工具

如果你要把它接到支持 `MCP` 的工具里，可以使用下面的配置：

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

如果你要让 AI 专门生成和调试油猴脚本，还可以使用独立入口：

```bash
bb-browser-userscript-mcp
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

相关资源：

- 社区适配器仓库：[bb-sites](https://github.com/epiral/bb-sites)
- 仓库主页：[wintopic/TMAuto](https://github.com/wintopic/TMAuto)

## 油猴脚本开发流程

如果你要让 AI 生成、调试和验证 `userscript`，可以使用专用的 `MCP` 服务：

```bash
bb-browser-userscript-mcp
```

推荐流程：

1. 运行 `userscript_doctor` 检查浏览器、`daemon`、扩展和 `chrome.userScripts`
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

## 项目结构

| 路径 | 说明 |
| --- | --- |
| `packages/cli` | 命令行入口，负责命令解析、输出和本地调用体验 |
| `packages/daemon` | 本地后台服务，负责 `HTTP` 请求与 `SSE` 通信 |
| `packages/extension` | Chrome 扩展，负责接管真实浏览器并通过 `CDP` 执行操作 |
| `packages/mcp` | 通用 `MCP` 服务入口，便于 AI 工具直接接入 |
| `packages/userscript-mcp` | 面向油猴脚本工作流的专用 `MCP` 服务 |
| `packages/shared` | 共享协议、类型定义和运行时公共逻辑 |
| `docs/` | 设计文档、方案草稿和实现记录 |
| `skills/` | 配套技能说明和工作流文档 |

## 架构

```text
AI 代理（Codex、Claude Code、Cursor 等）
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
AI 代理 ↔ CLI/MCP ↔ localhost:19824 ↔ Chrome 扩展
```

- 默认没有遥测，也没有云端转发
- 页面内容、抓包结果、`trace` 记录主要保存在本地运行时内存中
- 是否访问某个网站、是否执行某个命令，完全由你自己控制

详细说明见：

- [PRIVACY.md](PRIVACY.md)
- [SECURITY.md](SECURITY.md)

## 开发与贡献

本地开发命令：

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
