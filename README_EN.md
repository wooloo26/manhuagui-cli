# manhuagui-cli

<p align="center">
  <a href="https://www.npmjs.com/package/manhuagui-cli"><img src="https://img.shields.io/npm/v/manhuagui-cli" alt="npm version"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node.js >= 22"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/manhuagui-cli" alt="License: MIT"></a>
</p>

<p align="center">CLI tool for downloading manhua from manhuagui.com</p>

[中文](README.md)

---

## Table of Contents

- [manhuagui-cli](#manhuagui-cli)
  - [Table of Contents](#table-of-contents)
  - [Quick Start](#quick-start)
  - [Features](#features)
  - [Installation](#installation)
    - [npm Global Install (Recommended)](#npm-global-install-recommended)
    - [From Source](#from-source)
  - [Usage](#usage)
    - [Interactive Mode](#interactive-mode)
    - [CLI Mode](#cli-mode)
    - [Options](#options)
  - [Configuration](#configuration)
    - [Priority](#priority)
    - [Environment Variables](#environment-variables)
  - [Output Structure](#output-structure)
  - [Development](#development)
  - [Changelog](#changelog)
  - [License](#license)
  - [Disclaimer](#disclaimer)

## Quick Start

```bash
# Install globally
npm install -g manhuagui-cli

# Download a comic, follow the prompts
manhuagui-cli

# Or specify a URL directly
manhuagui-cli <URL>

# Filter by section name
manhuagui-cli <URL> -s "Single Volumes"

# Preview mode, list chapters without downloading
manhuagui-cli <URL> --dry-run

# Resume interrupted download
manhuagui-cli <URL> --resume
```

## Features

- **Interactive mode**: Running without arguments launches an interactive prompt that guides you through URL input and section selection
- **CLI mode**: Full CLI argument support for scripting and automation
- **Anti-bot evasion**: Uses Playwright headless Chromium to mimic real browser requests and bypass anti-bot measures
- **Identity rotation**: Randomly switches User-Agent and viewport size to simulate real user behavior
- **CDN resilience**: Automatically rotates CDN hosts on image download failure with retry (default 3 attempts)
- **Concurrency control**: Concurrent image downloads within a chapter, sequential chapters with randomized delays
- **Real-time progress**: Terminal progress bars displaying speed, per-chapter progress, overall progress, and ETA
- **Preview mode** (`--dry-run`): Lists pending chapters without downloading, useful for planning
- **Resumable downloads**: Progress automatically saved to `progress.json`, resume with `--resume` / `-r`
- **Clean directory structure**: `output/<comic-title>/<section>/<chapter>/001.webp`

## Installation

### npm Global Install (Recommended)

```bash
npm install -g manhuagui-cli
```

After installation, use the `manhuagui-cli` command directly.

### From Source

```bash
git clone https://github.com/wooloo26/manhuagui-cli.git
cd manhuagui-cli
pnpm install
pnpm build
pnpm link --global
```

## Usage

### Interactive Mode

Run without arguments and the tool will guide you through each step:

```bash
manhuagui-cli
```

Interactive flow:

1. Enter the comic URL
2. The tool parses comic metadata (title, sections, chapter list)
3. Select which sections to download (multi-select supported)
4. Confirm and start downloading

```text
Input comic URL:
  https://www.manhuagui.com/comic/12345/

Parsing comic page...
  Some Comic Title

Which sections to download?
  [x] Single Volumes (12 chapters)
  [ ] Serialized (200 chapters)
  [x] Extras (3 chapters)
  Confirm

 Overall  3/4 ch · 6/8 pg · 45s elapsed · ~15s
 [====================>                   ]  50%
 Ch.3  2/2 pg · Single Volumes · 93.5 KB/s · ~15s
```

### CLI Mode

```bash
# Show help
manhuagui-cli --help

# Download a specific section
manhuagui-cli https://www.manhuagui.com/comic/12345/ -s "Single Volumes"

# Download a specific chapter
manhuagui-cli https://www.manhuagui.com/comic/12345/ -s "Serialized" -c "Chapter 01"

# Specify output directory
manhuagui-cli https://www.manhuagui.com/comic/12345/ -o ./my-comics

# Resume interrupted download
manhuagui-cli https://www.manhuagui.com/comic/12345/ --resume

# Preview mode
manhuagui-cli https://www.manhuagui.com/comic/12345/ --dry-run
```

### Options

| Option                | Alias | Default  | Description                                                    |
| --------------------- | ----- | -------- | -------------------------------------------------------------- |
| `--section <name>`    | `-s`  | All      | Download only the named section                                |
| `--chapter <name>`    | `-c`  | —        | Download only the named chapter                                |
| `--output <dir>`      | `-o`  | `./output` | Download output directory                                    |
| `--concurrency <n>`   | `-C`  | `2`      | Concurrent image downloads per chapter                         |
| `--retry <n>`         |       | `3`      | Retry count per image download                                 |
| `--log-level <level>` |       | `info`   | Log level: `debug` / `info` / `warn` / `error`                |
| `--resume`            | `-r`  | —        | Resume from previous interrupted download                      |
| `--dry-run`           | `-d`  | —        | Preview mode (list chapters without downloading)               |
| `--help`              | `-h`  | —        | Show help                                                      |
| `--version`           | `-v`  | —        | Show version                                                   |

## Configuration

In addition to CLI arguments, behavior can be customized via config files and environment variables.

### Priority

```
CLI args > environment variables > defaults
```

### Environment Variables

Copy `.env.example` to `.env` and modify as needed. System environment variables are also supported.

| Variable              | Default    | Description                                             |
| --------------------- | ---------- | ------------------------------------------------------- |
| `OUTPUT_BASE`         | `./output` | Download output directory                               |
| `IMAGE_CONCURRENCY`   | `2`        | Concurrent image downloads per chapter                  |
| `DOWNLOAD_DELAY`      | `3000`     | Delay between image batches (ms, 0 to disable)         |
| `CHAPTER_DELAY_MIN`   | `3000`     | Min delay between chapters (ms)                         |
| `CHAPTER_DELAY_MAX`   | `6000`     | Max delay between chapters (ms)                         |
| `RETRY_COUNT`         | `3`        | Retry count per image download                          |
| `RETRY_BACKOFF_BASE`  | `1000`     | Retry backoff base (ms), wait `N * base` on Nth retry  |
| `IMAGE_LOAD_DELAY`    | `200`      | Wait after page turn for image to load (ms)             |
| `LOG_LEVEL`           | `info`     | Log level: `debug` / `info` / `warn` / `error`          |
| `USER_AGENTS`         | —          | Custom User-Agent pool, one per line                    |

## Output Structure

```text
output/
└── <comic-title>/
    ├── urls.json          # Chapter image URL manifest
    ├── progress.json      # Download progress (for resume)
    └── <section>/
        └── <chapter>/
            ├── 001.webp
            ├── 002.webp
            └── ...
```

## Development

```bash
pnpm install      # Install dependencies
pnpm dev          # Run in dev mode (TypeScript directly)
pnpm build        # Compile TypeScript
pnpm typecheck    # Type check
pnpm test         # Run tests
pnpm check        # Lint and format check (Biome)
pnpm format       # Auto-fix formatting
```

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## License

[MIT](./LICENSE)

## Disclaimer

This tool is for educational and personal use only. Please respect the terms of service of the target website and the intellectual property rights of content creators. Do not use this tool for commercial purposes or to distribute copyrighted content without permission.
