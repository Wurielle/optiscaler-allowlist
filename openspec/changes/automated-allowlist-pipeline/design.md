## Context

This is a greenfield Node.js/TypeScript project. There is no existing application code — only the OpenSpec workflow tooling and a package.json with the `@fission-ai/openspec` CLI dependency. The project needs a complete pipeline that scrapes three GPU vendor websites for upscaler-compatible game lists, resolves game names to Steam IDs, checks anti-cheat safety, and publishes a unified allowlist. Everything runs as GitHub Actions workflows.

The three data sources have very different access patterns:
- **NVIDIA** exposes a structured JSON API — no parsing needed.
- **AMD** serves a single HTML page with tabbed sections — game names appear in grids within each tab.
- **Intel** serves a WordPress/Elementor page — game names appear in text blocks under section headings.

## Goals / Non-Goals

**Goals:**
- Fully automated daily pipeline from scrape to allowlist with zero manual steps
- Each pipeline stage reads/writes JSON files in `data/` — the repo is the database
- Independent, testable modules per stage (scraper, matcher, checker, generator)
- Resilient to upstream page structure changes via AI-assisted HTML parsing for AMD and Intel

**Non-Goals:**
- Real-time or on-demand scraping (daily cron is sufficient)
- A web UI or API for querying the allowlist (consumers read `data/allowlist.json` directly)
- Epic Games Store or Xbox matching (architecture supports it, but not implemented in this change)
- Re-checking anti-cheat status for previously checked games (incremental only)
- Handling NVIDIA "App" entries — only "Game" type is relevant

## Decisions

### 1. NVIDIA: Direct JSON fetch, no AI

**Decision:** Fetch the NVIDIA JSON endpoint directly and parse with standard JSON methods.

**Rationale:** NVIDIA provides a stable, structured JSON API. Using AI here would add cost and latency with no benefit. The JSON schema has been stable (same field names across hundreds of entries). Filter entries by `type === "Game"` and map the raw field names to camelCase.

**Alternatives considered:**
- Scraping the HTML page like AMD/Intel — unnecessary since the JSON API exists and is the same data source the page renders from.

### 2. AMD/Intel: AI-assisted HTML extraction

**Decision:** Fetch the raw HTML and send it (or relevant sections) to an LLM API to extract structured game lists. Use a system prompt that describes the expected output schema and the section structure.

**Rationale:** Both pages render game data in HTML that lacks semantic markup (no consistent table structure, CSS class names change). Traditional DOM parsing with cheerio/JSDOM would be brittle — a class name or layout change breaks the scraper. An LLM can interpret the visual/textual structure and extract game names even when the HTML changes, as long as the content is conceptually the same.

**Approach:**
- Fetch full HTML with `fetch()` (Node.js built-in)
- For AMD: strip navigation/footer boilerplate, extract the content within each tab section (identifiable by the `#fsr4-item-*-tab` fragment IDs) and send each section to the LLM separately
- For Intel: strip boilerplate, send the main content area to the LLM
- LLM returns a JSON array of game names per section
- The scraper validates the LLM output against a Zod schema before writing

**Alternatives considered:**
- **cheerio/JSDOM DOM parsing** — Too brittle. These marketing pages change layout frequently. A CSS selector-based approach would require constant maintenance.
- **Headless browser (Puppeteer/Playwright)** — Heavier dependency, slower in CI, and the pages don't require JavaScript execution to render the game lists (the data is in the initial HTML).

### 3. AI provider: OpenAI-compatible API with model configurable via env var

**Decision:** Use the OpenAI SDK (`openai` npm package) pointed at an endpoint and model specified by environment variables (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`). Default to an OpenAI model but allow any OpenAI-compatible provider (OpenRouter, Anthropic via proxy, local Ollama, etc.).

**Rationale:** Avoids vendor lock-in. GitHub Actions secrets store the API key. The parsing task is straightforward structured extraction — any reasonably capable model works. Making it configurable lets contributors use cheaper/local models for development.

**Alternatives considered:**
- **Hardcoded OpenAI** — Less flexible, harder for contributors without an OpenAI key.
- **No AI, regex-based extraction** — Too fragile for marketing pages that change often.

### 4. Steam matching: Steam Store search API

**Decision:** Use the Steam Store search endpoint (`https://store.steampowered.com/api/storesearch/?term=<name>&l=english&cc=US`) to resolve game names to app IDs. Pick the top result if the name is a close match (fuzzy string similarity check). Implement request throttling (1 request per second) and exponential backoff on 429 responses.

**Rationale:** The Steam Store search is public, requires no API key, and returns results ranked by relevance. Fuzzy matching handles minor naming differences between provider data and Steam listings (e.g., "DOOM: The Dark Ages" vs "DOOM: The Dark Ages").

**Alternatives considered:**
- **`ISteamApps/GetAppList/v2`** — Returns every app on Steam (100k+ entries). Would need to download the full list and match locally. More data to process but avoids rate limit issues. Could be a future optimization.
- **SteamDB/IGDB** — External databases with better search but require API keys or scraping.

### 5. Anti-cheat data source: AreWeAntiCheatYet + AI fallback

**Decision:** Primary source: the community-maintained [AreWeAntiCheatYet](https://areweanticheatyet.com/) dataset (available as JSON on GitHub). For games not covered, fall back to an AI web search query to determine anti-cheat status. Mark the `source` field accordingly.

**Rationale:** AreWeAntiCheatYet is the most comprehensive open dataset for anti-cheat information across PC games. It tracks which anti-cheat systems (EAC, BattlEye, Vanguard, etc.) each game uses and their Linux/Proton compatibility — which correlates with DLL injection tolerance. The AI fallback handles games not yet in the dataset.

**Alternatives considered:**
- **PCGamingWiki** — Has anti-cheat info but requires scraping and is less structured.
- **AI-only** — Would work but is slower, more expensive, and less reliable than a structured dataset for known games.

### 6. File-based pipeline architecture

**Decision:** Each pipeline stage is a standalone TypeScript module that reads input JSON files from `data/` and writes output JSON files to `data/`. There is no shared in-memory state between stages. The `data/` directory is the pipeline's database, committed to the repo.

**Rationale:** File-based makes each stage independently testable and debuggable — you can inspect the intermediate files. It also makes the GitHub Actions workflow simple: each job runs a stage, commits if changed, which triggers the next workflow. No database, no state management, no deployment.

**Data flow:**
```
data/providers/{nvidia,amd,intel}.json
        ↓ (store-matching reads game names)
data/stores/steam.json
        ↓ (anticheat-checking reads app IDs)
data/anticheat/steam.json
        ↓ (allowlist-generation reads all of the above)
data/allowlist.json
```

**Alternatives considered:**
- **In-memory orchestrator** — A single script that runs all stages sequentially. Simpler but less composable, harder to debug, and doesn't support the triggered-workflow model.
- **External database (SQLite, Supabase)** — Overkill for this use case. JSON files in git give versioning for free.

### 7. GitHub Actions workflow topology

**Decision:** Four separate workflows with trigger chaining:

| Workflow | Trigger | Runs | Commits to |
|---|---|---|---|
| `scrape.yml` | `schedule` (daily cron) + `workflow_dispatch` | All 3 provider scrapers | `data/providers/` |
| `match.yml` | `push` on `data/providers/**` | Store matcher | `data/stores/` |
| `anticheat.yml` | `push` on `data/stores/**` | Anti-cheat checker | `data/anticheat/` |
| `allowlist.yml` | `push` on `data/anticheat/**` or `data/stores/**` | Allowlist generator | `data/allowlist.json` |

Each workflow uses a concurrency group keyed to its name to prevent parallel runs. Commits from workflows use a bot identity (`github-actions[bot]`).

**Rationale:** Separate workflows give clear separation of concerns, independent failure handling, and the trigger chain ensures the correct execution order without explicit orchestration. If the scrape finds no changes, nothing downstream runs.

**Alternatives considered:**
- **Single monolithic workflow** — Simpler but no independent re-runs, harder to debug individual stages, and runs the full pipeline even if only one provider changed.
- **Reusable workflow with `workflow_call`** — More DRY but harder to understand the trigger chain.

### 8. Module structure

```
src/
  scrapers/
    nvidia.ts          # fetch JSON API, filter, normalize
    amd.ts             # fetch HTML, AI extract, validate
    intel.ts            # fetch HTML, AI extract, validate
    index.ts           # runs all scrapers, handles partial failure
  matchers/
    steam.ts           # Steam Store search + fuzzy matching
    index.ts           # reads providers, diffs against existing, runs matcher
  checkers/
    anticheat.ts       # AreWeAntiCheatYet + AI fallback
    index.ts           # reads store mappings, diffs against existing, runs checker
  generators/
    allowlist.ts       # merges providers + stores + anticheat
  types/
    providers.ts       # NvidiaGame, AmdGame, IntelGame interfaces
    stores.ts          # StoreMapping interface
    anticheat.ts       # AntiCheatResult interface
    allowlist.ts       # AllowlistEntry interface
    errors.ts          # ScraperError, MatcherError, CheckerError
  utils/
    ai.ts              # OpenAI client wrapper, prompt helpers
    http.ts            # fetch with retry/backoff
    json.ts            # read/write JSON with 2-space indent + trailing newline
  index.ts             # CLI entry point (dispatch to subcommands: scrape, match, check, generate)
```

## Risks / Trade-offs

**[AMD/Intel page structure changes] → AI parsing is resilient but not infallible.** If a provider completely redesigns their page, the LLM may return incorrect data. Mitigation: validate LLM output against Zod schemas; alert on empty results or dramatic count changes vs. previous run.

**[AI API cost] → Each scrape run makes LLM calls for AMD and Intel.** With daily runs, this is ~60 calls/month. Mitigation: use a cheap/fast model (GPT-4o-mini or equivalent); cache raw HTML and skip AI call if HTML hasn't changed (hash comparison).

**[Steam search accuracy] → Fuzzy name matching may produce false positives.** Provider names don't always match Steam exactly (e.g., trademark symbols, subtitles). Mitigation: use string similarity threshold; log low-confidence matches for manual review; allow manual overrides in the store mapping file.

**[Rate limiting across providers] → Steam and anti-cheat sources may throttle.** Mitigation: built-in request throttling; exponential backoff; configurable delays. GitHub Actions has generous network allowances.

**[Workflow trigger loops] → A workflow that commits could trigger itself.** Mitigation: GitHub Actions does not trigger workflows from commits made by `github-actions[bot]` using the default `GITHUB_TOKEN`. This is the default behavior and prevents loops.

**[Game name normalization] → Same game may appear with different names across providers.** E.g., "DOOM: The Dark Ages" (NVIDIA) vs "DOOM: The Dark Ages" (AMD). Mitigation: normalize names (trim, collapse whitespace, normalize unicode) before comparison. The allowlist generator matches by normalized name. Exact deduplication across providers is a known hard problem — start with exact-after-normalization and iterate.

## Open Questions

- **Anti-cheat rechecking cadence:** Should previously-checked games be rechecked periodically? Anti-cheat status can change with game updates. Not in scope for v1 but worth considering.
- **Manual overrides:** Should there be a mechanism for manually overriding store mappings or anti-cheat results? A `data/overrides/` directory with manual entries could be merged at allowlist generation time.
- **NVIDIA value semantics:** The `"NV"`, `"NV, U"`, `"NV, T"` values indicate NVIDIA App override support levels. Need to confirm with the OptiScaler project whether these distinctions matter for the allowlist or if any non-empty value = supported.
