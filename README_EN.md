# manhuagui-cli

<p align="center">
  <a href="https://www.npmjs.com/package/manhuagui-cli"><img src="https://img.shields.io/npm/v/manhuagui-cli" alt="npm version"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node.js >= 22"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/manhuagui-cli" alt="License: MIT"></a>
</p>

<p align="center">
  <strong>CLI tool for downloading comics from manhuagui.com</strong>
</p>

<p align="center">
  <a href="./README.md">中文</a>
</p>

<p align="center">
  <img src="demo.png" alt="screenshot">
</p>

## Quick Start

> **Note**: The default download speed is intentionally conservative. Increasing concurrency or reducing delays may result in your IP being banned for several hours. Adjust with caution.

```bash
npm install -g manhuagui-cli

manhuagui-cli
```

Run without arguments to be guided through the process step by step: enter comic URL -> parse comic info -> select sections (multi-select) -> download.

## Installation

### npm (recommended)

```bash
npm install -g manhuagui-cli
```

After installation, the `manhuagui-cli` command is available globally.

### From source

```bash
git clone https://github.com/wooloo26/manhuagui-cli.git
cd manhuagui-cli
pnpm install
pnpm build
pnpm start
```

## Usage

### CLI

```bash
# Show help
manhuagui-cli --help

# Download a specific section
manhuagui-cli https://www.manhuagui.com/comic/12345/ -s "單行本"

# Download a specific chapter
manhuagui-cli https://www.manhuagui.com/comic/12345/ -s "單話" -c "第01話"

# Specify output directory
manhuagui-cli https://www.manhuagui.com/comic/12345/ -o ./my-comics

# Resume from previous download
manhuagui-cli https://www.manhuagui.com/comic/12345/ --resume

# Resume + overwrite unfinished chapters
manhuagui-cli https://www.manhuagui.com/comic/12345/ --resume --overwrite

# Preview mode (no actual download)
manhuagui-cli https://www.manhuagui.com/comic/12345/ --dry-run
```

### Options

| Option                   | Default    | Description                                |
| ------------------------ | ---------- | ------------------------------------------ |
| `-s, --section <name>`   | all        | Filter by section name                     |
| `-c, --chapter <name>`   | —          | Filter by chapter name                     |
| `-o, --output <dir>`     | `./output` | Download output directory                  |
| `-C, --concurrency <n>`  | `2`        | Concurrent image downloads per chapter     |
| `--retry <n>`            | `3`        | Retry count per image                      |
| `--log-level <level>`    | `info`     | Log level: `debug` / `info` / `warn` / `error` |
| `-r, --resume`           | —          | Resume from previous download              |
| `-O, --overwrite`        | —          | Overwrite unfinished chapters on resume    |
| `-d, --dry-run`          | —          | Preview without downloading                |
| `-h, --help`             | —          | Show help                                  |
| `-v, --version`          | —          | Show version                               |

## Configuration

Behavior can also be adjusted via environment variables.

**Priority**: CLI args > environment variables > defaults

Copy `.env.example` to `.env` and edit as needed. You can also set system environment variables directly.

| Variable              | Default    | Description                                     |
| --------------------- | ---------- | ----------------------------------------------- |
| `OUTPUT_BASE`         | `./output` | Download output directory                       |
| `IMAGE_CONCURRENCY`   | `2`        | Concurrent image downloads per chapter          |
| `DOWNLOAD_DELAY`      | `3000`     | Delay between image batches (ms, 0 to disable)  |
| `CHAPTER_DELAY_MIN`   | `3000`     | Minimum delay between chapters (ms)             |
| `CHAPTER_DELAY_MAX`   | `6000`     | Maximum delay between chapters (ms)             |
| `RETRY_COUNT`         | `3`        | Retry count per image                           |
| `RETRY_BACKOFF_BASE`  | `500`      | Retry backoff base (ms), attempt N waits N * base |
| `LOG_LEVEL`           | `info`     | Log level: `debug` / `info` / `warn` / `error`  |
| `USER_AGENTS`         | —          | Custom User-Agent list (one per line)           |

## Output Directory Structure

```text
output/
└── <comic-name>/
    ├── progress.json         # Download progress (for resume)
    └── <section>/
        └── <chapter>/
            ├── 001.webp
            ├── 002.webp
            └── ...
```

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## License

[MIT](./LICENSE)

## Disclaimer

This tool is for educational and personal use only. Please respect the target website's terms of service and the intellectual property rights of content creators. Do not use this tool for commercial purposes or distribute copyrighted content without permission.
