# AGENTS.md — OptiScaler Allowlist

## Project Overview

Automated pipeline that maintains a compatibility list of games for [OptiScaler](https://github.com/cdozdil/OptiScaler). The system scrapes upscaler support tables from NVIDIA, AMD, and Intel webpages, matches game names to store IDs (Steam, Epic, Xbox), checks anti-cheat safety, and publishes a unified allowlist. Everything runs via GitHub Actions crons with AI-assisted page parsing.

## Tech Stack

- **Runtime:** Node.js >= 20 with ESM (`"type": "module"` in package.json)
- **Language:** TypeScript (strict mode)
- **Test runner:** Vitest
- **Linter/Formatter:** Biome
- **Package manager:** npm
- **CI:** GitHub Actions
- **Spec workflow:** OpenSpec (`openspec/` directory, `@fission-ai/openspec` CLI)

## Build / Lint / Test Commands

```bash
# Build
npm run build              # tsc compiles src/ -> dist/

# Lint & format
npm run lint               # biome check src/
npm run lint:fix           # biome check --write src/
npm run format             # biome format --write src/

# Test
npm test                   # vitest run
npm run test:watch         # vitest (watch mode)
npx vitest run src/path/to/file.test.ts          # single test file
npx vitest run -t "test name pattern"             # single test by name

# Type check
npm run typecheck          # tsc --noEmit

# CI (runs all checks)
npm run ci                 # typecheck && lint && test
```

## Repository Structure

```
data/                       # Generated JSON data files (committed)
  providers/
    nvidia.json             # Scraped NVIDIA upscaler support table
    amd.json                # Scraped AMD upscaler support table
    intel.json              # Scraped Intel upscaler support table
  stores/
    steam.json              # Game name -> Steam appId mapping
  anticheat/
    steam.json              # Store ID -> anti-cheat safety boolean
  allowlist.json            # Final unified allowlist

src/
  scrapers/                 # Web scrapers for provider pages
  matchers/                 # Game name -> store ID resolution
  checkers/                 # Anti-cheat safety verification
  types/                    # Shared TypeScript types and schemas
  utils/                    # Shared utilities
  index.ts                  # Main entry / orchestrator

.github/workflows/          # GitHub Actions
  scrape.yml                # Daily cron: scrape provider pages
  match.yml                 # Triggered: resolve store IDs for new entries
  anticheat.yml             # Triggered: check anti-cheat for new entries

openspec/                   # OpenSpec workflow artifacts
  config.yaml
  changes/                  # Active changes (spec-driven workflow)
```

## Code Style

### TypeScript

- **Strict mode** always (`"strict": true` in tsconfig)
- **ESM only** — use `import`/`export`, never `require()`
- Prefer `interface` over `type` for object shapes; use `type` for unions/intersections
- Prefer `const` over `let`; never use `var`
- Use `unknown` over `any`; if `any` is unavoidable, add `// eslint-disable-next-line` with justification
- Explicit return types on exported functions; inferred types for local/private functions

### Naming

| Element          | Convention        | Example                    |
|------------------|-------------------|----------------------------|
| Files/dirs       | kebab-case        | `steam-matcher.ts`         |
| Variables/funcs  | camelCase         | `fetchProviderData`        |
| Types/interfaces | PascalCase        | `GameEntry`, `ProviderData`|
| Constants        | UPPER_SNAKE_CASE  | `MAX_RETRY_COUNT`          |
| Enums            | PascalCase        | `Provider.Nvidia`          |
| JSON data keys   | camelCase         | `"appId"`, `"gameName"`    |
| Test files       | `*.test.ts`       | `steam-matcher.test.ts`    |

### Imports

- Group imports in this order, separated by blank lines:
  1. Node built-ins (`node:fs`, `node:path`)
  2. External packages
  3. Internal absolute paths (`@/`)
  4. Relative imports
- Use `node:` prefix for all Node.js built-in imports
- Prefer named exports over default exports

### Error Handling

- Use typed custom errors extending `Error` (e.g., `ScraperError`, `MatcherError`)
- Never swallow errors silently — always log or rethrow
- Use `Result<T, E>` pattern for expected failures (scrape misses, API 404s)
- Use `try/catch` only for truly exceptional cases (network down, parse crash)
- All scraper/matcher/checker functions must handle rate limits and retries

### Data Files (JSON)

- All generated data lives in `data/` and is committed to the repo
- JSON files use 2-space indentation and trailing newline
- Provider JSON schema: array of objects with `gameName`, provider-specific fields (upscaler version, MFG support, etc.)
- Store mapping schema: `{ [gameName: string]: { appId: number | null } }`
- Anti-cheat schema: `{ [appId: string]: { safe: boolean, source: string, checkedAt: string } }`
- The final `allowlist.json` is derived — never edit manually

### Testing

- Co-locate test files next to source: `steam-matcher.ts` / `steam-matcher.test.ts`
- Use `describe` blocks grouped by function name
- Test names follow pattern: `"should <expected behavior> when <condition>"`
- Mock external HTTP calls; never hit real APIs in tests
- Fixtures go in `__fixtures__/` directories next to test files

### Git & Commits

- Commit messages: sentence-case, imperative mood, start with verb ("Add ...", "Fix ...", "Update ...")
- No conventional commit prefixes (`feat:`, `fix:`, etc.)
- Atomic commits — one logical change per commit
- Never commit `.env` files or API keys
- Data file changes from automation get their own commits

### GitHub Actions

- Cron workflows run daily; use concurrency groups to prevent overlap
- Triggered workflows fire on `data/providers/**` or `data/stores/**` changes
- All workflows pin action versions to full SHA
- Secrets for AI API keys stored in GitHub repository secrets
- Each workflow step should have a descriptive `name:`

## OpenSpec Workflow

This project uses OpenSpec for structured change management. Changes follow the artifact sequence:

```
Explore -> Proposal -> Specs -> Design -> Tasks -> Apply -> Verify -> Archive
```

- Run `openspec status` to check current state
- Active changes live in `openspec/changes/<change-name>/`
- Use the `/opsx-*` slash commands in OpenCode to drive the workflow
- Never manually edit OpenSpec artifacts after creation — use the CLI/commands
- Archived changes go to `openspec/changes/archive/YYYY-MM-DD-<name>/`

## Key Domain Concepts

- **Provider:** GPU vendor (NVIDIA, AMD, Intel) that publishes upscaler-compatible game lists
- **Upscaler:** Technology like DLSS (NVIDIA), FSR (AMD), XeSS (Intel)
- **MFG:** Multi-Frame Generation — an advanced upscaler feature (boolean per game)
- **Store:** Game distribution platform (Steam, Epic Games Store, Xbox)
- **AppId:** Platform-specific game identifier (e.g., Steam app ID is numeric)
- **Anti-cheat safe:** Whether a game's anti-cheat system allows OptiScaler injection
- **Allowlist:** The final curated list of games safe to use with OptiScaler
