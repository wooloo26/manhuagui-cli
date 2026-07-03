# manhuagui-cli

> 漫画柜 (manhuagui.com) 漫画下载命令行工具

[English](README_EN.md)

## 功能特性

- 交互式命令行界面，也支持命令行参数直接运行
- 自动解析漫画页面，列出所有章节与卷
- 使用 Playwright 模拟浏览器请求，绕过反爬检测
- 随机 User-Agent 和视口大小，模拟真实用户行为
- CDN 节点自动轮换，图片下载失败时自动重试（最多 3 次）
- 章节内图片并发下载，章节之间顺序处理并添加随机延迟
- **实时下载进度条**：显示速度、章节进度、整体进度及 ETA 预估
- **预览模式** (`--dry-run`)：列出待下载章节而不实际下载
- 断点续传：进度保存到 `progress.json`，中断后可通过 `--resume` / `-r` 继续
- 下载目录结构清晰：`output/<漫画名>/<章节组>/<章节>/001.webp`

## 系统要求

- **Node.js** >= 22
- **pnpm**（推荐）或 npm

## 安装

### npm（推荐）

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

```bash
pnpm dev
# 或编译后：
pnpm build
node dist/index.js
```

按提示输入漫画 URL，选择要下载的章节组，确认后开始下载。

### 命令行模式

```bash
node dist/index.js <URL> [选项]
# 或全局安装后：
manhuagui-cli <URL> [选项]

# 查看帮助
node dist/index.js --help

# 示例：下载指定章节组
node dist/index.js https://www.manhuagui.com/comic/12345/ -s "单行本"

# 示例：下载指定章节
node dist/index.js https://www.manhuagui.com/comic/12345/ -s "单话" -c "第01话"

# 示例：断点续传
node dist/index.js https://www.manhuagui.com/comic/12345/ --resume
```

### 选项

| 选项                  | 简写  | 说明                                          |
| --------------------- | ----- | --------------------------------------------- |
| `--section <name>`    | `-s`  | 指定要下载的章节组名称（默认：全部）          |
| `--chapter <name>`    | `-c`  | 指定要下载的章节名称                          |
| `--output <dir>`      | `-o`  | 下载输出目录                                  |
| `--concurrency <n>`   | `-C`  | 章节内图片并发下载数                          |
| `--retry <n>`         |       | 图片下载重试次数                              |
| `--log-level <level>` |       | 日志级别：`debug` \| `info` \| `warn` \| `error` |
| `--resume`            | `-r`  | 断点续传模式                                  |
| `--dry-run`           | `-d`  | 预览模式（不实际下载）                        |
| `--help`              | `-h`  | 显示帮助信息                                  |
| `--version`           | `-v`  | 显示版本号                                    |

## 配置

所有配置项按以下优先级生效（高优先级覆盖低优先级）：

```
CLI 参数 > 配置文件 > 环境变量 > 默认值
```

### 配置文件

支持两个位置的 JSON 配置文件，项目级覆盖全局级：

- **项目级**: `<当前目录>/.manhuaguirc.json`
- **全局**: `~/.config/manhuagui-cli/config.json`（Windows: `%USERPROFILE%\.config\manhuagui-cli\config.json`）

```json
{
  "outputBase": "./downloads",
  "imageConcurrency": 4,
  "retryCount": 5,
  "logLevel": "debug"
}
```

全部可选，未指定的项使用默认值。

### 环境变量

复制 `.env.example` 为 `.env`，根据需要修改。也支持直接设置系统环境变量。

| 变量                  | 默认值     | 说明                                     |
| --------------------- | ---------- | ---------------------------------------- |
| `OUTPUT_BASE`         | `./output` | 下载输出目录                             |
| `IMAGE_CONCURRENCY`   | `2`        | 章节内图片并发下载数                     |
| `DOWNLOAD_DELAY`      | `3000`     | 图片批次之间延迟（毫秒，0 禁用）         |
| `CHAPTER_DELAY_MIN`   | `3000`     | 章节间最小延迟（毫秒）                   |
| `CHAPTER_DELAY_MAX`   | `6000`    | 章节间最大延迟（毫秒）                   |
| `RETRY_COUNT`         | `3`        | 图片下载重试次数                         |
| `RETRY_BACKOFF_BASE`  | `1000`     | 重试退避基准毫秒（第 N 次重试等待 N×base） |
| `IMAGE_LOAD_DELAY`    | `200`      | 翻页后等待图片加载时间（毫秒）           |
| `LOG_LEVEL`           | `info`     | 日志级别：`debug` \| `info` \| `warn` \| `error` |
| `USER_AGENTS`         | —          | 自定义 User-Agent 列表（每行一个）       |

## 输出目录结构

```
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
pnpm install           # 安装依赖
pnpm dev               # 开发模式运行（直接运行 TypeScript）
pnpm build             # 编译 TypeScript
pnpm typecheck         # 类型检查
pnpm test              # 运行测试
pnpm check             # 代码检查和格式化检查
pnpm format            # 自动格式化
```

## License

[MIT](LICENSE)

## 免责声明

本工具仅供学习和个人使用。请遵守目标网站的服务条款，尊重内容创作者的知识产权。请勿将本工具用于商业用途或在未经许可的情况下分发受版权保护的内容。
