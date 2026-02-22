## Why

OptiScaler needs a machine-readable allowlist of compatible games so users know which titles are safe to use with the tool. Today, upscaler support data is scattered across NVIDIA, AMD, and Intel webpages with no unified source, and there is no automated way to check whether a game's anti-cheat will block OptiScaler injection. This pipeline automates the entire flow — scraping provider pages, resolving game names to store IDs, verifying anti-cheat safety, and publishing a single allowlist — so the data stays current without manual effort.

## What Changes

- Add web scrapers for NVIDIA, AMD, and Intel upscaler support tables that output structured JSON per provider
- Add a game-name-to-store-ID matcher starting with Steam (extensible to Epic and Xbox later)
- Add an anti-cheat safety checker that determines whether each game allows third-party injection
- Add an allowlist generator that merges provider data, store IDs, and anti-cheat status into a single `data/allowlist.json`
- Add GitHub Actions cron workflows for daily scraping and triggered workflows for matching, anti-cheat checking, and allowlist generation
- Add shared types, schemas, and utilities for the pipeline
- Set up the TypeScript project (tsconfig, Biome, Vitest, npm scripts)

## Capabilities

### New Capabilities

- `provider-scraping`: Fetch upscaler support data from NVIDIA, AMD, and Intel and persist structured JSON to `data/providers/`. Each provider file captures game name plus provider-specific fields (upscaler version, MFG support, supported features). Data sources:
  - **NVIDIA** — Direct JSON API at `https://www.nvidia.com/content/dam/en-zz/Solutions/geforce/news/nvidia-rtx-games-engines-apps/dlss-rt-games-apps-overrides.json`. Returns a `data` array with per-entry fields: `name`, `type` (Game/App), `dlss multi frame generation`, `dlss frame generation`, `dlss super resolution`, `dlss ray reconstruction`, `dlaa`, `ray tracing`. Values are `""` (unsupported), `"Yes"` (native), `"NV"` / `"NV, U"` / `"NV, T"` (NVIDIA App override). Only entries with `type === "Game"` are relevant.
  - **AMD** — Single HTML page at `https://www.amd.com/en/products/graphics/technologies/fidelityfx/supported-games.html` with tabbed sections: FSR "Redstone" (`#fsr4-item-6514045aac-tab`), FSR 3 (`#fsr4-item-7a3bbedc7f-tab`), FSR 2 (`#fsr4-item-dae8c7ecb4-tab`). Each tab contains a grid of game names — presence in a section means support. Redstone also has a sub-section for "FSR Frame Generation (ML) Support".
  - **Intel** — WordPress page at `https://game.intel.com/us/xess-enabled-games/`. Lists game names under "XeSS 2 enabled games" and "XeSS enabled games" sections. Presence-based like AMD.
- `store-matching`: Resolve game names from provider data to store-specific IDs. Starting with Steam appId lookups, with the architecture supporting Epic and Xbox in the future. Persists mappings to `data/stores/`.
- `anticheat-checking`: Determine whether each matched game is safe from anti-cheat interference when using OptiScaler. Persists results to `data/anticheat/` keyed by store ID.
- `allowlist-generation`: Merge provider data, store mappings, and anti-cheat results into a unified `data/allowlist.json` that downstream consumers (OptiScaler itself, documentation, community tools) can read.
- `pipeline-automation`: GitHub Actions workflows that orchestrate the pipeline — daily cron for scraping, triggered workflows for matching and anti-cheat checking when provider data changes, and allowlist regeneration when any upstream data changes.
- `project-foundation`: TypeScript project setup including tsconfig (strict, ESM), Biome config, Vitest config, npm scripts, and shared types/utilities used across all pipeline stages.

### Modified Capabilities

None. This is the initial implementation — no existing capabilities to modify.

## Impact

- **New source files**: `src/scrapers/`, `src/matchers/`, `src/checkers/`, `src/types/`, `src/utils/`, `src/index.ts`
- **New data files**: `data/providers/{nvidia,amd,intel}.json`, `data/stores/steam.json`, `data/anticheat/steam.json`, `data/allowlist.json`
- **New workflows**: `.github/workflows/{scrape,match,anticheat}.yml`
- **New config files**: `tsconfig.json`, `biome.json`, `vitest.config.ts`
- **Dependencies**: TypeScript, Vitest, Biome, plus libraries for HTTP fetching and HTML parsing. AI API client for interpreting AMD/Intel HTML pages.
- **External services**: NVIDIA JSON API (read, no auth), AMD FidelityFX page (read, HTML parse), Intel XeSS page (read, HTML parse), Steam Store API (read), AI API for page parsing (read, requires API key), anti-cheat databases/search (read)
- **Package.json**: Adds `devDependencies`, `scripts`, `type: "module"`, `engines`
