<div align="center">

# TampermonkeyAuto

### 让 AI 自动编写、安装、调试和回归验证篡改猴脚本

**面向 AI 代理的 userscript 工作台，而不只是一个通用浏览器自动化壳子。**

[![构建状态](https://github.com/wintopic/TMAuto/actions/workflows/ci.yml/badge.svg)](https://github.com/wintopic/TMAuto/actions/workflows/ci.yml)
[![Node.js 版本](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![许可证](https://img.shields.io/badge/许可证-MIT-blue.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/wintopic/TMAuto?style=social)](https://github.com/wintopic/TMAuto/stargazers)

[项目定位](#项目定位) · [快速开始](#快速开始) · [典型工作流](#典型工作流) · [核心工具](#核心工具) · [仓库结构](#仓库结构) · [命名说明](#命名说明)

</div>

---

## 项目定位

`TampermonkeyAuto` 的目标很明确：

- 让 AI 根据页面上下文和任务描述生成篡改猴脚本
- 让 AI 自动完成脚本工程初始化、构建、安装、更新和卸载
- 让 AI 在真实浏览器里调试脚本，读取日志、存储、网络请求和页面报错
- 让 AI 把脚本导出为可安装的 `.user.js`，并做回归验证

这个仓库不是把“浏览器自动化”当成终点，而是把它作为 `userscript` 开发的底层基础设施。核心入口是 `userscript-mcp`，核心产物是 Tampermonkey 兼容脚本。

## 它解决什么问题

传统的油猴脚本开发通常会卡在这些环节：

- AI 只能写代码，不能真正装进浏览器验证
- 页面状态、登录态、脚本日志、报错和网络请求分散在不同地方
- 每次调试都要手工刷新、手工安装、手工看控制台
- 脚本跑通之后，很难稳定复现和做回归检查

`TampermonkeyAuto` 把这几件事串成一条 AI 可调用的工作流：先诊断环境，再生成脚本，再安装到真实浏览器运行，再收集调试信息，最后导出和回归。

## 核心能力

- 诊断浏览器、扩展、`daemon` 和 `chrome.userScripts` 是否可用
- 根据页面 URL 和任务意图生成脚本草稿或完整工程骨架
- 自动构建 `dist/*.user.js`
- 自动安装或更新脚本到浏览器开发运行时
- 自动收集脚本日志、`GM_*` 存储、网络请求和页面错误
- 自动导出 Tampermonkey 兼容脚本
- 自动执行回归场景，判断脚本是否继续正常工作

## 快速开始

### 环境要求

- `Node.js 18+`
- Chrome 或兼容 `chrome.userScripts` / `chrome.debugger` 的 Chromium 内核浏览器
- 已加载本仓库提供的扩展
- 本地可启动 `daemon`

### 安装

当前发布包和命令名仍沿用既有实现，因此安装命令还是：

```bash
npm install -g bb-browser
```

安装后，和 `userscript` 工作流最相关的入口是：

```bash
bb-browser-daemon
bb-browser-userscript-mcp
```

### 浏览器准备

1. 从 [Releases](https://github.com/wintopic/TMAuto/releases/latest) 下载扩展压缩包
2. 解压后打开 `chrome://extensions/`
3. 打开“开发者模式”
4. 点击“加载已解压的扩展程序”
5. 选择解压后的扩展目录
6. 启动本地后台服务

```bash
bb-browser-daemon
```

### 接入 AI 工具

如果你的 AI 工具支持 `MCP`，推荐直接接入 `userscript-mcp`：

```json
{
  "mcpServers": {
    "tampermonkey-auto": {
      "command": "bb-browser-userscript-mcp"
    }
  }
}
```

## 典型工作流

把它理解成“AI 写脚本 + AI 调试脚本 + AI 验证脚本”的流水线会更准确。

### 1. 先跑环境诊断

AI 先调用：

- `userscript_doctor`

它会检查浏览器是否可用、扩展是否连通、`chrome.userScripts` 是否可用、`daemon` 是否在线，以及项目目录是否已经准备好。

### 2. 创建脚本项目

有两种常见方式：

- `userscript_project_init`
  适合你已经知道脚本名称、匹配规则和基础权限
- `userscript_generate_from_page`
  适合直接给 AI 一个页面 URL 和任务目标，让它先生成草稿

生成后的项目结构大致如下：

```text
your-script/
  meta.json
  src/
    main.ts
  scenarios/
    smoke.json
  dist/
    your-script.user.js
```

### 3. 构建并在真实浏览器里调试

核心工具是：

- `userscript_build`
- `userscript_dev_install`
- `userscript_dev_update`
- `userscript_dev_run`

其中 `userscript_dev_run` 最适合作为 AI 的默认调试入口，因为它会一次性完成：

1. 构建脚本
2. 安装或更新脚本
3. 打开目标页面
4. 等待脚本执行
5. 回收调试信息

### 4. 查看脚本运行结果

AI 可以继续调用：

- `userscript_logs`
- `userscript_storage`
- 浏览器侧的网络、页面报错和交互调试能力

这样脚本有没有运行、写入了哪些 `GM_*` 数据、打到了哪些接口、页面有没有异常，都可以直接拿到结构化结果。

### 5. 导出和发布

脚本跑通后，可以使用：

- `userscript_export_tampermonkey`
- `userscript_publish_local`

前者产出标准的 `.user.js` 文件，后者会把脚本发布到本地地址，方便安装和更新。

### 6. 做回归验证

最后再跑：

- `userscript_regression_run`

它会根据场景文件重新执行步骤和断言，帮助 AI 判断这次修改有没有把原来的功能改坏。

## 核心工具

下面这些工具是这个项目最关键的对外能力：

| 工具名 | 作用 |
| --- | --- |
| `userscript_doctor` | 诊断本机和项目环境是否可用于脚本开发 |
| `userscript_project_status` | 检查项目状态并给出下一步建议 |
| `userscript_project_init` | 初始化一个 userscript 工程 |
| `userscript_generate_from_page` | 基于页面和目标生成脚本草稿 |
| `userscript_build` | 构建 `.user.js` 成品 |
| `userscript_dev_install` | 将脚本安装到开发运行时 |
| `userscript_dev_update` | 更新开发运行时中的脚本 |
| `userscript_dev_run` | 构建、安装、打开页面并回收调试信息 |
| `userscript_logs` | 读取脚本日志 |
| `userscript_storage` | 读取 `GM_*` 存储数据 |
| `userscript_export_tampermonkey` | 导出 Tampermonkey 兼容脚本 |
| `userscript_publish_local` | 本地发布 `.user.js` 安装地址 |
| `userscript_regression_run` | 执行脚本回归测试 |

## 底层能力

虽然项目主目标是 `userscript` 自动化，但底层仍保留了一整套真实浏览器控制能力，方便 AI 在写脚本时辅助调试页面：

- 打开页面、切换标签页、读取快照
- 点击、输入、选择、滚动
- 抓取网络请求
- 读取控制台日志和页面错误
- 运行页面脚本和断言

这些能力的作用是服务于脚本开发，不是 README 的主叙事中心。

## 仓库结构

| 路径 | 说明 |
| --- | --- |
| `packages/userscript-mcp` | 面向 AI 的 userscript 高层工作流入口，也是本项目最核心的包 |
| `packages/extension` | 浏览器扩展，负责真实脚本运行时、日志、存储和安装同步 |
| `packages/daemon` | 本地后台服务，负责扩展与本机工具之间的通信 |
| `packages/mcp` | 通用浏览器控制 MCP，用于页面调试和补充操作 |
| `packages/cli` | 本地命令行能力 |
| `packages/shared` | userscript 元数据、协议、状态模型和公共工具 |
| `docs/` | 设计说明、工作流方案和实现文档 |

## 架构

```text
AI 工具
  │
  │ MCP
  ▼
userscript-mcp
  │
  │ 调用本地浏览器能力
  ▼
CLI / daemon / Chrome 扩展
  │
  ▼
chrome.userScripts + chrome.debugger
  │
  ▼
真实浏览器页面
```

## 命名说明

这里需要明确说明一件事，避免继续让人误解：

- 这个仓库现在对外定位是 `TampermonkeyAuto`
- 但当前实现是基于 `bb-browser` 演进出来的
- 因此内部包名、命令名、部分目录名仍保留了 `bb-browser` 前缀

这代表的是实现历史，不代表项目定位。对外描述、README 和开源展示应以“AI 自动化编写篡改猴脚本”这件事为中心。

## 隐私与安全

这个项目默认在本机运行，核心链路是本地通信：

```text
AI 工具 ↔ MCP / CLI ↔ localhost ↔ Chrome 扩展 ↔ 真实浏览器
```

- 默认没有遥测，也没有云端转发
- 脚本日志、页面调试信息和运行态数据优先保留在本地
- 是否访问页面、安装脚本、执行调试，完全由你自己控制

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
