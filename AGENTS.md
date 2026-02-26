# AGENTS.md - OptiScaler Allowlist

## Purpose
Guidance for coding agents operating in this repository.
Prefer existing patterns in `src/` and tests when in doubt.

## Project Summary
Pipeline stages:
1. Scrape provider support lists (NVIDIA, AMD, Intel)
2. Match game names to Steam app IDs
3. Check anti-cheat safety
4. Generate per-game allowlist files in `data/allowlist/steam/[appid].json`

Important current behavior:
- AMD/Intel scraping is deterministic HTML parsing (not LLM extraction).
- Generated data under `data/` is committed.

## Stack
- Node.js >= 20 (ESM)
- TypeScript (strict)
- Vitest
- Biome (lint + format)
- npm
- GitHub Actions

## Commands

## Install
```bash
npm ci
```

## Build, Typecheck, Lint, Format
```bash
npm run build       # tsc
npm run typecheck   # tsc --noEmit
npm run lint        # biome check src/
npm run lint:fix    # biome check --write src/
npm run format      # biome format --write src/
npm run ci          # typecheck + lint + test
```

## Test Commands
```bash
npm test
npm run test:watch

# Single test file
npx vitest run src/scrapers/amd.test.ts

# Single test by name pattern
npx vitest run -t "should throw ScraperError"

# Single test by file + name pattern
npx vitest run src/generators/allowlist.test.ts -t "should write one file per appId"
```

## Pipeline Commands
CLI entry:
```bash
npx tsx src/index.ts <command> [--limit N]
```

Commands:
- `scrape` - update `data/providers/*.json`
- `match` - update `data/stores/steam.json`
- `check` - update `data/anticheat/steam.json`
- `generate` - write `data/allowlist/steam/*.json`
- `pipeline` - run all stages

Examples:
```bash
npx tsx src/index.ts scrape
npx tsx src/index.ts match --limit 25
npx tsx src/index.ts pipeline --limit 10
```

## Code Style

## TypeScript
- Keep strict typing; avoid `any`.
- Use explicit return types for exported functions.
- Prefer `interface` for object contracts; use `type` for unions/mapped types.
- Prefer `const`; use `let` only when needed.
- ESM imports/exports only.

## Imports
- Use `node:` prefixes for built-ins.
- Group imports in this order:
  1) node built-ins
  2) third-party packages
  3) internal relative imports
- Let Biome handle ordering.

## Naming
- Variables/functions: `camelCase`
- Types/interfaces/classes: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Tests: `*.test.ts` next to source files
- Keep file naming consistent with existing folders (`amd.ts`, `intel.ts`, `index.ts`).

## Formatting
- Follow Biome output exactly.
- Keep comments minimal and useful.
- Prefer small focused functions.

## Error Handling
- Use domain errors from `src/types/errors.ts`:
  - `ScraperError`
  - `MatcherError`
  - `CheckerError`
- Throw specific, actionable error messages.
- Do not silently swallow errors.
- For provider layout changes, throw `ScraperError` with provider-specific context.

## Scraper + Generator Rules
- Prefer deterministic parsing for provider pages.
- Validate output with Zod schemas in `src/types/` before writing.
- Preserve defensive guards:
  - missing heading/table detection
  - suspicious large drop detection
- Allowlist generator writes one JSON file per Steam app ID.
- Keep generator idempotent and clean stale output files.

## Testing Guidance
- Mock network calls (`globalThis.fetch = vi.fn(...)`).
- Do not hit real external services in unit tests.
- Cover success and failure paths:
  - HTTP non-OK
  - structure/layout change failures
  - sanity guard failures
  - per-app output behavior and cleanup

## Data + Schema Notes
- Do not manually edit generated files unless the task explicitly requires it.
- Provider entries use `name` (not `gameName`).
- Keep schema compatibility when editing `src/types/*.ts`.

## Git + CI Expectations
- Keep commits atomic and descriptive.
- Never commit secrets or `.env` files.
- Keep workflow behavior that opens issues on scrape failures.
- Do not casually unpin GitHub Action SHAs.

## Cursor / Copilot Rules
Checked paths:
- `.cursor/rules/**/*`
- `.cursorrules`
- `.github/copilot-instructions.md`

Current state: no Cursor or Copilot rule files found.

## OpenSpec Note
OpenSpec artifacts exist in `openspec/`.
If a task is OpenSpec-driven, align implementation with active artifacts.
