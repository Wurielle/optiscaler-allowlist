# AGENTS.md - OptiScaler Allowlist

## Purpose

This file guides coding agents working in this repository.
Follow existing code and tests first, then apply these rules.

## Project Summary

This repo maintains OptiScaler compatibility data through a staged pipeline:

1. Scrape provider support lists (NVIDIA, AMD, Intel)
2. Match game names to Steam app IDs
3. Check anti-cheat safety
4. Generate `data/allowlist.json`

Key detail: AMD and Intel scraping is deterministic HTML parsing (not LLM extraction).

## Stack

- Runtime: Node.js >= 20, ESM mode
- Language: TypeScript (strict)
- Test runner: Vitest
- Lint/format: Biome
- Package manager: npm
- CI: GitHub Actions

## Command Reference

## Install

```bash
npm ci
```

## Build / Typecheck / Lint / Format

```bash
npm run build       # tsc
npm run typecheck   # tsc --noEmit
npm run lint        # biome check src/
npm run lint:fix    # biome check --write src/
npm run format      # biome format --write src/
npm run ci          # typecheck + lint + test
```

## Tests

```bash
npm test
npm run test:watch

# Single test file
npx vitest run src/scrapers/amd.test.ts

# Single test by test name pattern
npx vitest run -t "should throw ScraperError"

# Single test in one file by name
npx vitest run src/scrapers/intel.test.ts -t "parsed game count drops"
```

## Pipeline Commands

Main CLI entry:

```bash
npx tsx src/index.ts <command> [--limit N]
```

Commands:

- `scrape` - scrape provider data into `data/providers/*.json`
- `match` - resolve names to Steam app IDs
- `check` - anti-cheat checking for unresolved entries
- `generate` - build unified allowlist
- `pipeline` - run all stages in sequence

Examples:

```bash
npx tsx src/index.ts scrape
npx tsx src/index.ts match --limit 25
npx tsx src/index.ts pipeline --limit 10
```

## Code Style and Conventions

## TypeScript

- Keep strict typing; avoid `any`.
- Exported functions should have explicit return types.
- Prefer `interface` for object contracts and `type` for unions/mapped types.
- Use `const` by default; use `let` only when reassignment is required.
- Use ESM imports/exports only.

## Imports

- Use `node:` prefixes for built-ins (`node:path`, `node:fs/promises`).
- Keep imports grouped in this order:
  1) node built-ins
  2) third-party packages
  3) internal relative modules
- Let Biome enforce import ordering; run lint fix after edits.

## Naming

- Files: generally lower-case; existing pattern is folder-based with simple names (`amd.ts`, `intel.ts`, `index.ts`).
- Variables/functions: `camelCase`
- Types/interfaces/classes: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Test files: `*.test.ts` beside source files

## Formatting

- Follow Biome output exactly.
- Keep comments sparse and high-value.
- Prefer short, focused functions over long procedural blocks.

## Error Handling

- Use domain errors from `src/types/errors.ts`:
  - `ScraperError`
  - `MatcherError`
  - `CheckerError`
- Throw specific errors with actionable messages.
- Do not silently swallow exceptions.
- For expected "layout changed" scraper failures, throw `ScraperError` with provider-specific context.

## Scraper Rules

- Prefer deterministic parsing for provider pages when possible.
- Validate parsed output with Zod schemas from `src/types/providers.ts`.
- Preserve defensive guards (e.g., missing heading/table checks, abnormal count drop checks).
- If structure assumptions change, update tests first or alongside code.

## Testing Guidance

- Mock network calls via `globalThis.fetch = vi.fn(...)`.
- Do not call real external services in unit tests.
- Cover:
  - success parsing
  - HTTP non-OK handling
  - layout-change failures
  - sanity guards (suspicious drops, empty extraction)

## Data and Schemas

- Generated data is committed under `data/`.
- Do not hand-edit generated JSON unless task explicitly requires it.
- Current provider records use `name` (not `gameName`).
- Preserve schema compatibility in `src/types/*.ts` and validate before write.

## Git and CI Expectations

- Keep commits atomic and descriptive.
- Do not commit secrets or `.env` files.
- Scrape workflow opens issues on scrape failure; keep that behavior intact.
- Workflow files are pinned-action style; do not casually unpin versions.

## Cursor / Copilot Rule Files

Checked paths:

- `.cursor/rules/**/*`
- `.cursorrules`
- `.github/copilot-instructions.md`

No Cursor or Copilot rule files currently exist in this repository.

## OpenSpec Notes

OpenSpec artifacts exist under `openspec/`.
If a task is OpenSpec-driven, keep changes aligned with active artifacts.
