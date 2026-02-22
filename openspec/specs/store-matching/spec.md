## ADDED Requirements

### Requirement: Resolve game names to Steam app IDs
The system SHALL read all unique game names from `data/providers/*.json`, search the Steam Store for each name, and persist the mapping to `data/stores/steam.json`. The mapping SHALL be an object keyed by game name, with each value containing an `appId` field (number or null if no match found).

#### Scenario: Successful Steam match
- **WHEN** a game name from provider data (e.g., "Black Myth: Wukong") is searched on the Steam Store
- **AND** a matching result is found
- **THEN** the entry in `data/stores/steam.json` SHALL have `appId` set to the numeric Steam app ID

#### Scenario: No Steam match found
- **WHEN** a game name is searched but no result is found on Steam
- **THEN** the entry in `data/stores/steam.json` SHALL have `appId` set to `null`

#### Scenario: Game name already mapped
- **WHEN** a game name already exists in `data/stores/steam.json` with a non-null `appId`
- **THEN** the matcher SHALL skip that name and not re-query the Steam Store

### Requirement: Only match new entries from provider data
The matcher SHALL compare the current set of game names across all provider JSON files against the existing keys in `data/stores/steam.json` and only attempt to match names that are not yet present.

#### Scenario: Incremental matching after provider update
- **WHEN** `data/providers/nvidia.json` is updated with 3 new game entries
- **AND** those game names do not exist in `data/stores/steam.json`
- **THEN** the matcher SHALL search Steam for exactly those 3 new names and add them to the store mapping

### Requirement: Handle Steam API rate limits
The matcher SHALL respect Steam Store API rate limits by implementing request throttling. If a rate limit response is received, the matcher SHALL wait and retry with exponential backoff.

#### Scenario: Rate limit hit during matching
- **WHEN** the Steam Store API returns a rate limit response (HTTP 429)
- **THEN** the matcher SHALL wait with exponential backoff and retry the request up to a configurable maximum number of retries

### Requirement: Store mapping output format
The `data/stores/steam.json` file SHALL be an object where keys are game names (strings) and values are objects with at least an `appId` field. The JSON file SHALL use 2-space indentation and a trailing newline.

#### Scenario: Store mapping file structure
- **WHEN** `data/stores/steam.json` is written
- **THEN** it SHALL follow the structure `{ "Game Name": { "appId": 12345 }, "Unknown Game": { "appId": null } }`
