## 1. Project Foundation

- [x] 1.1 Update `package.json` with `name`, `version`, `type: "module"`, `engines`, and npm scripts (`build`, `lint`, `lint:fix`, `format`, `test`, `test:watch`, `typecheck`, `ci`)
- [x] 1.2 Add dev dependencies: `typescript`, `vitest`, `@biomejs/biome`
- [x] 1.3 Add runtime dependencies: `openai`, `zod`
- [x] 1.4 Create `tsconfig.json` with `strict: true`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, target ES2022, outDir `dist/`, rootDir `src/`
- [x] 1.5 Create `biome.json` config with formatter and linter rules for the project
- [x] 1.6 Create `vitest.config.ts` pointing at `src/`
- [x] 1.7 Create `src/` directory structure: `scrapers/`, `matchers/`, `checkers/`, `generators/`, `types/`, `utils/`
- [x] 1.8 Create `data/` directory structure: `providers/`, `stores/`, `anticheat/`
- [x] 1.9 Verify `npm run build`, `npm run lint`, and `npm test` all run successfully on empty project

## 2. Shared Types & Utilities

- [x] 2.1 Define `NvidiaGame` interface in `src/types/providers.ts` with fields: `gameName`, `dlssMultiFrameGeneration`, `dlssFrameGeneration`, `dlssSuperResolution`, `dlssRayReconstruction`, `dlaa`, `rayTracing`
- [x] 2.2 Define `AmdGame` interface in `src/types/providers.ts` with fields: `gameName`, `fsrRedstone`, `fsr3`, `fsr2`, `fsrFrameGenerationMl`
- [x] 2.3 Define `IntelGame` interface in `src/types/providers.ts` with fields: `gameName`, `xess2`, `xess`
- [x] 2.4 Define `StoreMapping` interface in `src/types/stores.ts` with structure `Record<string, { appId: number | null }>`
- [x] 2.5 Define `AntiCheatResult` interface in `src/types/anticheat.ts` with fields: `safe`, `source`, `checkedAt`
- [x] 2.6 Define `AllowlistEntry` interface in `src/types/allowlist.ts` with fields: `gameName`, `stores`, `providers`
- [x] 2.7 Create custom error classes in `src/types/errors.ts`: `ScraperError` (with `provider`, `statusCode`), `MatcherError` (with `gameName`), `CheckerError` (with `appId`)
- [x] 2.8 Create `src/utils/json.ts` with `readJson()` and `writeJson()` helpers (2-space indent, trailing newline, creates parent dirs if missing)
- [x] 2.9 Create `src/utils/http.ts` with `fetchWithRetry()` (configurable retries, exponential backoff on 429)
- [x] 2.10 Create `src/utils/ai.ts` with OpenAI client wrapper that reads `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` from env vars and exposes a `extractStructuredData(html, prompt, schema)` function
- [x] 2.11 Write unit tests for `json.ts`, `http.ts`, and error classes

## 3. NVIDIA Scraper

- [x] 3.1 Create `src/scrapers/nvidia.ts` that fetches the NVIDIA JSON API endpoint
- [x] 3.2 Filter entries to `type === "Game"` only
- [x] 3.3 Map raw field names (`dlss multi frame generation`, etc.) to camelCase interface fields
- [x] 3.4 Validate output against `NvidiaGame[]` Zod schema
- [x] 3.5 Write result to `data/providers/nvidia.json`
- [x] 3.6 Throw `ScraperError` on non-200 HTTP responses
- [x] 3.7 Write unit tests with mocked HTTP responses (success, error, empty data, mixed Game/App types)

## 4. AMD Scraper

- [x] 4.1 Create `src/scrapers/amd.ts` that fetches the AMD FidelityFX supported games HTML page
- [x] 4.2 Strip navigation/footer boilerplate from HTML
- [x] 4.3 Extract content sections for FSR Redstone, FSR 3, FSR 2, and FSR Frame Generation (ML) tabs
- [x] 4.4 Send each section to AI extraction with a prompt describing the expected output (array of game name strings)
- [x] 4.5 Merge section results into `AmdGame[]` (game present in Redstone section → `fsrRedstone: true`, etc.)
- [x] 4.6 Validate output against `AmdGame[]` Zod schema
- [x] 4.7 Write result to `data/providers/amd.json`
- [x] 4.8 Throw `ScraperError` if AI returns empty results or fails validation
- [x] 4.9 Write unit tests with mocked HTML and mocked AI responses

## 5. Intel Scraper

- [x] 5.1 Create `src/scrapers/intel.ts` that fetches the Intel XeSS enabled games HTML page
- [x] 5.2 Strip boilerplate from HTML, extract main content area
- [x] 5.3 Send content to AI extraction with a prompt describing the expected output (XeSS 2 games and XeSS 1 games as separate arrays)
- [x] 5.4 Merge into `IntelGame[]` (game in XeSS 2 list → `xess2: true`, in XeSS list → `xess: true`)
- [x] 5.5 Validate output against `IntelGame[]` Zod schema
- [x] 5.6 Write result to `data/providers/intel.json`
- [x] 5.7 Throw `ScraperError` if AI returns empty results or fails validation
- [x] 5.8 Write unit tests with mocked HTML and mocked AI responses

## 6. Scraper Orchestrator

- [x] 6.1 Create `src/scrapers/index.ts` that runs all three scrapers, handling partial failures (one scraper failing does not block others)
- [x] 6.2 Log success/failure per provider and return a summary
- [x] 6.3 Write integration test that verifies partial failure isolation

## 7. Steam Store Matcher

- [x] 7.1 Create `src/matchers/steam.ts` with a function that searches the Steam Store search API for a game name and returns the best matching app ID (or null)
- [x] 7.2 Implement fuzzy string similarity check between the query name and the top search result name
- [x] 7.3 Implement request throttling (1 request/second) to stay under rate limits
- [x] 7.4 Create `src/matchers/index.ts` that reads all provider JSON files, collects unique game names, diffs against existing `data/stores/steam.json`, and runs the matcher only for new names
- [x] 7.5 Write updated mappings to `data/stores/steam.json`
- [x] 7.6 Write unit tests with mocked Steam API responses (match found, no match, rate limit, multiple results)

## 8. Anti-Cheat Checker

- [x] 8.1 Create `src/checkers/anticheat.ts` with a function that checks a game's anti-cheat status against the AreWeAntiCheatYet dataset
- [x] 8.2 Implement AI fallback for games not found in the dataset
- [x] 8.3 Create `src/checkers/index.ts` that reads `data/stores/steam.json`, collects app IDs with non-null values, diffs against existing `data/anticheat/steam.json`, and runs the checker only for new IDs
- [x] 8.4 Write results to `data/anticheat/steam.json` with `safe`, `source`, and `checkedAt` fields
- [x] 8.5 Skip and log warning for games where anti-cheat status cannot be determined
- [x] 8.6 Write unit tests with mocked dataset responses and mocked AI fallback

## 9. Allowlist Generator

- [x] 9.1 Create `src/generators/allowlist.ts` that reads all provider files, store mappings, and anti-cheat results
- [x] 9.2 Filter to games that have a non-null app ID and `safe: true` anti-cheat status
- [x] 9.3 Merge provider features into a single entry per game (NVIDIA + AMD + Intel fields under `providers`)
- [x] 9.4 Sort entries alphabetically by `gameName`
- [x] 9.5 Write result to `data/allowlist.json`
- [x] 9.6 Write unit tests verifying: inclusion/exclusion logic, multi-provider merge, single-provider entry, alphabetical sort, idempotent output

## 10. CLI Entry Point

- [x] 10.1 Create `src/index.ts` with subcommand dispatch: `scrape`, `match`, `check`, `generate`
- [x] 10.2 Wire each subcommand to the corresponding module's index function
- [x] 10.3 Add a `pipeline` subcommand that runs all stages in sequence
- [x] 10.4 Add `bin` field to `package.json` or use `tsx` for direct execution in CI

## 11. GitHub Actions Workflows

- [x] 11.1 Create `.github/workflows/scrape.yml` with daily cron schedule and `workflow_dispatch` trigger, runs all scrapers, commits changed files to `data/providers/`
- [x] 11.2 Create `.github/workflows/match.yml` triggered by pushes to `data/providers/**`, runs store matcher, commits to `data/stores/`
- [x] 11.3 Create `.github/workflows/anticheat.yml` triggered by pushes to `data/stores/**`, runs anti-cheat checker, commits to `data/anticheat/`
- [x] 11.4 Create `.github/workflows/allowlist.yml` triggered by pushes to `data/anticheat/**` or `data/stores/**`, runs allowlist generator, commits to `data/allowlist.json`
- [x] 11.5 Add concurrency groups to all workflows (keyed by workflow name, queue instead of cancel)
- [x] 11.6 Pin all third-party action versions to full commit SHAs
- [x] 11.7 Add `AI_API_KEY` and `AI_BASE_URL` as repository secrets references in workflows that run scrapers
- [x] 11.8 Configure bot commit identity (`github-actions[bot]`) and conditional commit (skip if no changes)

## 12. Final Validation

- [x] 12.1 Run `npm run ci` (typecheck + lint + test) and verify all checks pass
- [x] 12.2 Run the full pipeline locally end-to-end (`scrape` → `match` → `check` → `generate`) and verify `data/allowlist.json` is produced
- [x] 12.3 Verify all data files use 2-space indentation and trailing newline
- [x] 12.4 Review `.gitignore` to ensure `dist/`, `.env`, and `node_modules/` are excluded but `data/` is committed
