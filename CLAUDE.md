# manhuagui-cli

A CLI tool for downloading comics from manhuagui.com. Supports both interactive mode and direct CLI arguments.

## Tech Stack

- **TypeScript** (ES2022) + **Node.js** >= 22
- **citty** — CLI command definition & argument parsing
- **cheerio** — Server-side HTML parsing
- **playwright** — Headless Chromium for anti-bot evasion & image download
- **log-update** + **chalk** — Terminal progress bars with speed & ETA
- **@clack/prompts** — Interactive prompts
- **vitest** + **biome** — Testing & linting/formatting

## Commands

```bash
pnpm dev        # Dev run (tsx src/index.ts)
pnpm build      # Compile (tsc)
pnpm start      # Run compiled output (node dist/index.js)
pnpm test       # Run tests (vitest)
pnpm typecheck  # Type check (tsc --noEmit)
pnpm check      # Lint + format check (biome check .)
pnpm format     # Auto-fix (biome check --write .)
pnpm release    # Bump version, generate changelog, tag, push, create GitHub Release
```

## Commit Convention

This repo uses [Conventional Commits](https://www.conventionalcommits.org/) with `release-it` for automatic changelog generation.

### Format

```
<type>(<scope>): <description>
```

| type | Purpose | Bumps version |
|------|---------|---------------|
| `feat` | New feature | **minor** |
| `fix` | Bug fix | **patch** |

These types do not bump the version but appear in the changelog:

| type | Purpose |
|------|---------|
| `chore` | Build, CI, dependencies, tooling |
| `refactor` | Code refactor (no behavior change) |
| `perf` | Performance improvement |
| `docs` | Documentation |
| `test` | Tests |
| `style` | Formatting (no logic change) |

### Examples

```
feat(download): add concurrent download progress display
fix(comic): handle empty chapter count parse error
chore: bump playwright to 1.62
refactor: extract CDN rotation logic into separate module
```

### Notes

- `feat:` and `fix:` trigger automatic version bumps (minor/patch)
- `BREAKING CHANGE:` footer triggers a major bump
- Other types are recorded in the changelog only, no version bump

## Project Structure

```
src/
├── index.ts          # Entry point
└── lib/
    ├── cli.ts        # Command orchestration (interactive/direct mode)
    ├── comic.ts      # Comic page parsing (chapter list)
    ├── chapter.ts    # Chapter image extraction & download
    ├── tasks.ts      # Download pipeline (section/chapter iteration)
    ├── download.ts   # CDN host rotation download
    ├── browser.ts    # Playwright browser context (anti-detection)
    ├── config.ts     # Environment variables & defaults
    ├── types.ts      # Type definitions
    ├── utils.ts      # Utility functions
    ├── prompts.ts    # Interactive prompts
    ├── progress.ts   # Download progress & resume
    ├── ui.ts         # Terminal progress display (log-update + chalk)
    ├── speed.ts      # Speed tracking & ETA estimation
    ├── logger.ts     # Logging
    └── errors.ts     # Custom errors
```
