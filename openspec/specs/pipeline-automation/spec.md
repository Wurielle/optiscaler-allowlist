## ADDED Requirements

### Requirement: Daily cron scrapes provider data
A GitHub Actions workflow SHALL run on a daily cron schedule and execute all three provider scrapers (NVIDIA, AMD, Intel). If any provider data changes, the workflow SHALL commit the updated JSON files to the repository.

#### Scenario: Provider data has changed
- **WHEN** the daily cron runs and a scraper produces output that differs from the current committed file
- **THEN** the workflow SHALL commit the changed file(s) to the repository with a descriptive commit message

#### Scenario: No provider data changes
- **WHEN** the daily cron runs and all scraper outputs are identical to the committed files
- **THEN** the workflow SHALL NOT create a commit

### Requirement: Store matching triggers on provider data changes
A GitHub Actions workflow SHALL trigger when files in `data/providers/` are changed (via push or workflow completion). It SHALL run the store matcher to resolve any new game names to Steam app IDs and commit the results.

#### Scenario: New games added by scraper
- **WHEN** the scrape workflow commits updated provider data containing new game names
- **THEN** the store matching workflow SHALL trigger, resolve the new names, and commit updates to `data/stores/steam.json`

### Requirement: Anti-cheat checking triggers on store mapping changes
A GitHub Actions workflow SHALL trigger when `data/stores/steam.json` is changed. It SHALL run the anti-cheat checker for any new matched app IDs and commit the results.

#### Scenario: New store IDs matched
- **WHEN** the store matching workflow commits new entries to `data/stores/steam.json`
- **THEN** the anti-cheat workflow SHALL trigger, check the new app IDs, and commit updates to `data/anticheat/steam.json`

### Requirement: Allowlist regeneration triggers on upstream changes
A GitHub Actions workflow SHALL trigger when either `data/anticheat/` or `data/stores/` files change. It SHALL regenerate `data/allowlist.json` and commit the result if it differs from the current version.

#### Scenario: Anti-cheat data updated
- **WHEN** the anti-cheat workflow commits updates to `data/anticheat/steam.json`
- **THEN** the allowlist workflow SHALL trigger, regenerate `data/allowlist.json`, and commit if changed

### Requirement: Workflows use concurrency groups
Each workflow SHALL use a GitHub Actions concurrency group to prevent overlapping runs of the same workflow. If a new run is triggered while a previous one is in progress, the newer run SHALL queue (not cancel the in-progress one).

#### Scenario: Concurrent scrape runs
- **WHEN** a manual scrape run is triggered while the daily cron scrape is still running
- **THEN** the manual run SHALL wait until the cron run completes before starting

### Requirement: Workflows pin action versions
All third-party GitHub Actions used in workflows SHALL be pinned to a full commit SHA, not a tag or branch reference.

#### Scenario: Action version pinning
- **WHEN** a workflow uses `actions/checkout`
- **THEN** it SHALL reference it by full SHA (e.g., `actions/checkout@<sha>`) not by tag (e.g., `actions/checkout@v4`)
