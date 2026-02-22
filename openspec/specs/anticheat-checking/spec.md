## ADDED Requirements

### Requirement: Check anti-cheat safety for matched games
The system SHALL determine whether each game with a resolved store ID is safe to use with OptiScaler (i.e., its anti-cheat system does not block third-party DLL injection). Results SHALL be persisted to `data/anticheat/steam.json` keyed by store app ID.

#### Scenario: Game is anti-cheat safe
- **WHEN** the checker determines a game does not use an injection-blocking anti-cheat
- **THEN** the entry in `data/anticheat/steam.json` SHALL have `safe` set to `true`, `source` set to the data source used for the determination, and `checkedAt` set to an ISO 8601 timestamp

#### Scenario: Game is not anti-cheat safe
- **WHEN** the checker determines a game uses an anti-cheat that blocks OptiScaler injection
- **THEN** the entry in `data/anticheat/steam.json` SHALL have `safe` set to `false`, `source` set to the data source, and `checkedAt` set to an ISO 8601 timestamp

### Requirement: Only check new entries
The checker SHALL compare the current set of matched app IDs (from `data/stores/steam.json` where `appId` is not null) against the existing keys in `data/anticheat/steam.json` and only check IDs not yet present.

#### Scenario: Incremental checking after new matches
- **WHEN** `data/stores/steam.json` is updated with 5 new entries that have non-null `appId` values
- **AND** those app IDs do not exist in `data/anticheat/steam.json`
- **THEN** the checker SHALL look up anti-cheat status for exactly those 5 app IDs

### Requirement: Anti-cheat data output format
The `data/anticheat/steam.json` file SHALL be an object keyed by app ID (as string). Each value SHALL contain `safe` (boolean), `source` (string identifying the data source), and `checkedAt` (ISO 8601 string). The JSON file SHALL use 2-space indentation and a trailing newline.

#### Scenario: Anti-cheat file structure
- **WHEN** `data/anticheat/steam.json` is written
- **THEN** it SHALL follow the structure `{ "12345": { "safe": true, "source": "areweanticheatyet.com", "checkedAt": "2025-01-15T10:30:00Z" } }`

### Requirement: Handle checker failures gracefully
If the anti-cheat check fails for a specific game (source unavailable, ambiguous result), the system SHALL skip that game and log a warning. It SHALL NOT write a partial or uncertain result.

#### Scenario: Anti-cheat source unavailable for a game
- **WHEN** the checker cannot determine anti-cheat status for a specific app ID
- **THEN** that app ID SHALL NOT be added to `data/anticheat/steam.json`
- **AND** a warning SHALL be logged with the app ID and reason
