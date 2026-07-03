# manhuagui-cli

> CLI tool for downloading manhua from manhuagui.com

[中文](README.md)

## Features

- Interactive CLI with prompts, also supports direct CLI args
- Auto-parses comic pages, lists all sections and chapters
- Uses Playwright headless browser to bypass anti-bot measures
- Random User-Agent and viewport rotation to simulate real users
- CDN host rotation with automatic retry (up to 3 attempts) on image download failure
- Concurrent image downloads within a chapter, sequential chapters with human-like delays
- Resumable downloads: progress saved to `progress.json`, resume with `--resume` / `-r`
- Clean output structure: `output/<comic-title>/<section>/<chapter>/001.webp`

## Requirements

- **Node.js** >= 22
- **pnpm** (recommended) or npm

## Installation

### npm (Recommended)

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

```bash
pnpm dev
# or build first:
pnpm build
node dist/index.js
```

Follow prompts to enter comic URL, select sections, and confirm download.

### CLI Mode

```bash
node dist/index.js <URL> [options]
# or if linked globally:
manhuagui-cli <URL> [options]

# Show help
node dist/index.js --help

# Example: download specific section
node dist/index.js https://www.manhuagui.com/comic/12345/ -s "单行本"

# Example: download specific chapter
node dist/index.js https://www.manhuagui.com/comic/12345/ -s "单话" -c "第01话"

# Example: resume interrupted download
node dist/index.js https://www.manhuagui.com/comic/12345/ --resume
```

### Options

| Option             | Alias | Description                                    |
| ------------------ | ----- | ---------------------------------------------- |
| `--section <name>` | `-s`  | Download only the named section (default: all) |
| `--chapter <name>` | `-c`  | Download only the named chapter                |
| `--resume`         | `-r`  | Resume from previous interrupted download      |
| `--help`           | `-h`  | Show help                                      |
| `--version`        | `-v`  | Show version                                   |

## Environment Variables

Copy `.env.example` to `.env` and modify as needed:

| Variable            | Default    | Description                            |
| ------------------- | ---------- | -------------------------------------- |
| `OUTPUT_BASE`       | `./output` | Download output directory              |
| `IMAGE_CONCURRENCY` | `2`        | Concurrent image downloads per chapter |
| `DOWNLOAD_DELAY`    | `3000`     | Delay between image batches (ms)       |
| `CHAPTER_DELAY_MIN` | `5000`     | Min delay between chapters (ms)        |
| `CHAPTER_DELAY_MAX` | `15000`    | Max delay between chapters (ms)        |
| `USER_AGENTS`       | —          | Custom User-Agent pool, one per line   |

## Output Structure

```
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
pnpm install           # Install dependencies
pnpm dev               # Run in dev mode (TypeScript directly)
pnpm build             # Compile TypeScript
pnpm typecheck         # Type check
pnpm test              # Run tests
pnpm check             # Lint and format check
pnpm format            # Auto-fix formatting
```

## License

[MIT](LICENSE)

## Disclaimer

This tool is for educational and personal use only. Please respect the terms of service of the target website and the intellectual property rights of content creators. Do not use this tool for commercial purposes or to distribute copyrighted content without permission.
