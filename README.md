# manhuagui-cli

<p align="center">
  <a href="https://www.npmjs.com/package/manhuagui-cli"><img src="https://img.shields.io/npm/v/manhuagui-cli" alt="npm version"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node.js >= 22"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/manhuagui-cli" alt="License: MIT"></a>
</p>

<p align="center">
  <strong>漫画柜 manhuagui 漫画下载命令行工具</strong>
</p>

<p align="center">
  <a href="./README.en.md">English</a>
</p>

<p align="center">
  <img src="demo.png" alt="screenshot">
</p>

## 快速开始

```bash
npm install -g manhuagui-cli

manhuagui-cli
```

## 功能特性

- 交互式界面：无参数运行时进入引导模式，输入 URL、选择章节组和章节
- 命令行模式：支持完整 CLI 参数，适合脚本化和自动化场景
- 反爬虫绕过：基于 Playwright 无头 Chromium 加载页面，绕过 JS 混淆和反爬检测
- 身份伪装：随机切换 User-Agent 与视口大小，模拟真实用户行为
- CDN 容错：图片下载自动轮换 CDN 节点，失败自动重试（默认 3 次）
- 并发控制：章节内图片并发下载，章节间顺序处理并加入随机延迟
- 实时进度：终端进度条显示下载速度、章节进度、整体进度及预计剩余时间
- 预览模式 (`--dry-run`)：列出待下载章节而不实际下载
- 断点续传：进度自动保存至 `progress.json`，中断后通过 `--resume` / `-r` 继续
- 覆盖模式 (`--overwrite`)：续传时仅重新下载未完成的章节，已完成的章节始终保留
- 清晰目录：`output/<漫画名>/<章节组>/<章节>/001.webp`

## 安装

### npm（推荐）

```bash
npm install -g manhuagui-cli
```

安装后即可直接使用 `manhuagui-cli` 命令。首次运行时 Playwright 会自动下载 Chromium 浏览器。

### 从源码

```bash
git clone https://github.com/wooloo26/manhuagui-cli.git
cd manhuagui-cli
pnpm install
pnpm build
pnpm link --global
```

## 使用方法

### 交互模式

不带参数运行，工具会逐步引导你完成操作：

```bash
manhuagui-cli
```

流程：输入漫画 URL -> 解析漫画信息 -> 选择章节组（多选） -> 开始下载。

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

# 断点续传 + 覆盖未完成章节
manhuagui-cli https://www.manhuagui.com/comic/12345/ --resume --overwrite

# 预览模式（不实际下载）
manhuagui-cli https://www.manhuagui.com/comic/12345/ --dry-run
```

### 选项

| 选项                    | 默认值     | 说明                                          |
| ----------------------- | ---------- | --------------------------------------------- |
| `-s, --section <name>`  | 全部       | 指定章节组名称                                |
| `-c, --chapter <name>`  | —          | 指定章节名称                                  |
| `-o, --output <dir>`    | `./output` | 下载输出目录                                  |
| `-C, --concurrency <n>` | `2`        | 章节内图片并发数                              |
| `--retry <n>`           | `3`        | 图片下载重试次数                              |
| `--log-level <level>`   | `info`     | 日志级别：`debug` / `info` / `warn` / `error` |
| `-r, --resume`          | —          | 断点续传模式                                  |
| `-O, --overwrite`       | —          | 续传时覆盖未完成的章节                        |
| `-d, --dry-run`         | —          | 预览模式（不实际下载）                        |
| `-h, --help`            | —          | 显示帮助信息                                  |
| `-v, --version`         | —          | 显示版本号                                    |

## 配置

除 CLI 参数外，还可通过环境变量调整行为。

**优先级**：CLI 参数 > 环境变量 > 默认值

将 `.env.example` 复制为 `.env`，按需修改。也可直接设置系统环境变量。

| 变量                 | 默认值     | 说明                                           |
| -------------------- | ---------- | ---------------------------------------------- |
| `OUTPUT_BASE`        | `./output` | 下载输出目录                                   |
| `IMAGE_CONCURRENCY`  | `2`        | 章节内图片并发数                               |
| `DOWNLOAD_DELAY`     | `3000`     | 图片批次间延迟（毫秒，0 为禁用）               |
| `CHAPTER_DELAY_MIN`  | `3000`     | 章节间最小延迟（毫秒）                         |
| `CHAPTER_DELAY_MAX`  | `6000`     | 章节间最大延迟（毫秒）                         |
| `RETRY_COUNT`        | `3`        | 图片下载重试次数                               |
| `RETRY_BACKOFF_BASE` | `1000`     | 重试退避基值（毫秒），第 N 次重试等待 N * base |
| `IMAGE_LOAD_DELAY`   | `200`      | 翻页后等待图片加载（毫秒）                     |
| `LOG_LEVEL`          | `info`     | 日志级别：`debug` / `info` / `warn` / `error`  |
| `USER_AGENTS`        | —          | 自定义 User-Agent 列表（每行一个）             |

## 输出目录结构

```text
output/
└── <漫画名>/
    ├── progress.json         # 下载进度（断点续传用）
    └── <章节组>/
        └── <章节>/
            ├── 001.webp
            ├── 002.webp
            └── ...
```

## 变更日志

详见 [CHANGELOG.md](./CHANGELOG.md)。

## 许可协议

[MIT](./LICENSE)

## 免责声明

本工具仅供学习和个人使用。请遵守目标网站的服务条款，尊重内容创作者的知识产权。请勿将本工具用于商业用途或在未经许可的情况下分发受版权保护的内容。
