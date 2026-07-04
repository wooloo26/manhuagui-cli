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
- **es-toolkit** — Functional utilities (`retry`, `chunk`, `sum`, `sample`, `randomInt`) replacing hand-rolled patterns
- **immer** — Immutable state updates for progress data (`produce()` in `updateChapterProgress`)
- **zod** — Runtime schema validation for parsed comic data, config, and progress files
- **consola** — Structured logging (replaces custom logger)

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
├── cli.ts            # Command orchestration (interactive/direct mode)
├── comic.ts          # Comic page parsing & browser context (anti-detection)
├── pipeline.ts       # Download pipeline (section/chapter iteration)
├── download.ts       # CDN host rotation download & image extraction
├── config.ts         # Environment variables & defaults
├── types.ts          # Type definitions + zod schemas
├── utils.ts          # Utility functions
├── prompts.ts        # Interactive prompts
├── progress.ts       # Download progress & resume
├── ui.ts             # Terminal progress display (log-update + chalk)
└── logger.ts         # Logging (consola)
```
