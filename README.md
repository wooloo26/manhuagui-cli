# manhuagui-cli

<p align="center">
  <a href="https://www.npmjs.com/package/manhuagui-cli"><img src="https://img.shields.io/npm/v/manhuagui-cli" alt="npm version"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node.js >= 22"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/manhuagui-cli" alt="License: MIT"></a>
</p>

<p align="center">漫画柜 (manhuagui.com) 漫画下载命令行工具</p>

---

## 目录

- [manhuagui-cli](#manhuagui-cli)
  - [目录](#目录)
  - [快速开始](#快速开始)
  - [功能特性](#功能特性)
  - [安装](#安装)
    - [npm 全局安装（推荐）](#npm-全局安装推荐)
    - [从源码安装](#从源码安装)
  - [使用方法](#使用方法)
    - [交互模式](#交互模式)
    - [命令行模式](#命令行模式)
    - [选项](#选项)
  - [配置](#配置)
    - [优先级](#优先级)
    - [环境变量](#环境变量)
  - [输出目录结构](#输出目录结构)
  - [开发](#开发)
  - [变更日志](#变更日志)
  - [许可协议](#许可协议)
  - [免责声明](#免责声明)

## 快速开始

```bash
# 全局安装
npm install -g manhuagui-cli

# 下载漫画，按提示操作
manhuagui-cli

# 或者在命令行直接指定 URL
manhuagui-cli <URL>

# 指定章节组
manhuagui-cli <URL> -s "单行本"

# 预览模式，仅列出章节不下载
manhuagui-cli <URL> --dry-run

# 断点续传
manhuagui-cli <URL> --resume
```

## 功能特性

- **交互式界面**：无参数运行时进入交互提示模式，引导输入 URL、选择章节组
- **命令行模式**：支持完整 CLI 参数，适合脚本化和自动化场景
- **反爬虫绕过**：基于 Playwright 无头 Chromium 模拟浏览器请求，绕过反爬检测
- **身份伪装**：随机切换 User-Agent 和视口大小，模拟真实用户行为
- **CDN 容错**：图片下载时自动轮换 CDN 节点，失败自动重试（默认 3 次）
- **并发控制**：章节内图片并发下载，章节间顺序处理并加入随机延迟
- **实时进度显示**：终端进度条，展示下载速度、章节进度、整体进度及预计剩余时间
- **预览模式** (`--dry-run`)：列出待下载章节而不实际下载，适合制定下载计划
- **断点续传**：进度自动保存至 `progress.json`，中断后通过 `--resume` / `-r` 继续
- **清晰目录结构**：`output/<漫画名>/<章节组>/<章节>/001.webp`

## 安装

### npm 全局安装（推荐）

```bash
npm install -g manhuagui-cli
```

安装后即可直接使用 `manhuagui-cli` 命令。

### 从源码安装

```bash
git clone https://github.com/wooloo26/manhuagui-cli.git
cd manhuagui-cli
pnpm install
pnpm build
pnpm link --global
```

## 使用方法

### 交互模式

不带参数运行，工具会引导你完成每一步操作：

```bash
manhuagui-cli
```

交互流程：

1. 输入漫画 URL
2. 工具自动解析漫画信息（标题、章节组、章节列表）
3. 选择要下载的章节组（支持多选）
4. 确认后开始下载

```text
Input comic URL:
  https://www.manhuagui.com/comic/12345/

Parsing comic page...
  某个漫画

Which sections to download?
  [x] 单行本 (12 chapters)
  [ ] 单话 (200 chapters)
  [x] 番外 (3 chapters)
  Confirm

 Overall  3/4 ch · 6/8 pg · 45s elapsed · ~15s
 [====================>                   ]  50%
 Ch.3  2/2 pg · 单行本 · 93.5 KB/s · ~15s
```

### 命令行模式

```bash
# 查看帮助
manhuagui-cli --help

# 下载指定章节组
manhuagui-cli https://www.manhuagui.com/comic/12345/ -s "单行本"

# 下载指定章节
manhuagui-cli https://www.manhuagui.com/comic/12345/ -s "单话" -c "第01话"

# 指定输出目录
manhuagui-cli https://www.manhuagui.com/comic/12345/ -o ./my-comics

# 断点续传
manhuagui-cli https://www.manhuagui.com/comic/12345/ --resume

# 预览模式
manhuagui-cli https://www.manhuagui.com/comic/12345/ --dry-run
```

### 选项

| 选项                   | 简写  | 默认值  | 说明                                          |
| ---------------------- | ----- | ------- | --------------------------------------------- |
| `--section <name>`     | `-s`  | 全部    | 指定要下载的章节组名称                        |
| `--chapter <name>`     | `-c`  | —       | 指定要下载的章节名称                          |
| `--output <dir>`       | `-o`  | `./output` | 下载输出目录                              |
| `--concurrency <n>`    | `-C`  | `2`     | 章节内图片并发下载数                          |
| `--retry <n>`          |       | `3`     | 图片下载重试次数                              |
| `--log-level <level>`  |       | `info`  | 日志级别：`debug` / `info` / `warn` / `error` |
| `--resume`             | `-r`  | —       | 断点续传模式                                  |
| `--dry-run`            | `-d`  | —       | 预览模式（不实际下载）                        |
| `--help`               | `-h`  | —       | 显示帮助信息                                  |
| `--version`            | `-v`  | —       | 显示版本号                                    |

## 配置

除 CLI 参数外，还支持通过配置文件和环境变量调整行为。

### 优先级

```
CLI 参数 > 环境变量 > 默认值
```

### 环境变量

将 `.env.example` 复制为 `.env`，根据需要修改。也支持直接设置系统环境变量。

| 变量                  | 默认值     | 说明                                         |
| --------------------- | ---------- | -------------------------------------------- |
| `OUTPUT_BASE`         | `./output` | 下载输出目录                                 |
| `IMAGE_CONCURRENCY`   | `2`        | 章节内图片并发下载数                         |
| `DOWNLOAD_DELAY`      | `3000`     | 图片批次间延迟（毫秒，设为 0 禁用）          |
| `CHAPTER_DELAY_MIN`   | `3000`     | 章节间最小延迟（毫秒）                       |
| `CHAPTER_DELAY_MAX`   | `6000`     | 章节间最大延迟（毫秒）                       |
| `RETRY_COUNT`         | `3`        | 图片下载重试次数                             |
| `RETRY_BACKOFF_BASE`  | `1000`     | 重试退避基值（毫秒），第 N 次重试等待 N * base |
| `IMAGE_LOAD_DELAY`    | `200`      | 翻页后等待图片加载时间（毫秒）               |
| `LOG_LEVEL`           | `info`     | 日志级别：`debug` / `info` / `warn` / `error` |
| `USER_AGENTS`         | —          | 自定义 User-Agent 列表（每行一个）           |

## 输出目录结构

```text
output/
└── <漫画名>/
    ├── urls.json          # 章节图片 URL 清单
    ├── progress.json      # 下载进度（断点续传用）
    └── <章节组>/
        └── <章节>/
            ├── 001.webp
            ├── 002.webp
            └── ...
```

## 开发

```bash
pnpm install      # 安装依赖
pnpm dev          # 开发模式运行（直接运行 TypeScript）
pnpm build        # 编译 TypeScript
pnpm typecheck    # 类型检查
pnpm test         # 运行测试
pnpm check        # 代码检查和格式化检查（Biome）
pnpm format       # 自动格式化
```

## 变更日志

详见 [CHANGELOG.md](./CHANGELOG.md)。

## 许可协议

[MIT](./LICENSE)

## 免责声明

本工具仅供学习和个人使用。请遵守目标网站的服务条款，尊重内容创作者的知识产权。请勿将本工具用于商业用途或在未经许可的情况下分发受版权保护的内容。
