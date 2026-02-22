## ADDED Requirements

### Requirement: Generate unified allowlist from upstream data
The system SHALL read all provider data files (`data/providers/*.json`), store mappings (`data/stores/steam.json`), and anti-cheat results (`data/anticheat/steam.json`) to produce a single `data/allowlist.json`. Only games that have a resolved store ID and are marked as anti-cheat safe SHALL be included.

#### Scenario: Game present in provider data, matched, and safe
- **WHEN** a game appears in at least one provider file
- **AND** it has a non-null `appId` in `data/stores/steam.json`
- **AND** its app ID is marked `safe: true` in `data/anticheat/steam.json`
- **THEN** the game SHALL appear in `data/allowlist.json`

#### Scenario: Game is not anti-cheat safe
- **WHEN** a game's app ID is marked `safe: false` in `data/anticheat/steam.json`
- **THEN** the game SHALL NOT appear in `data/allowlist.json`

#### Scenario: Game has no store ID
- **WHEN** a game has `appId: null` in the store mapping
- **THEN** the game SHALL NOT appear in `data/allowlist.json`

#### Scenario: Game has no anti-cheat check yet
- **WHEN** a game's app ID is not present in `data/anticheat/steam.json`
- **THEN** the game SHALL NOT appear in `data/allowlist.json`

### Requirement: Allowlist entries include merged provider features
Each entry in the allowlist SHALL include the game name, store ID, store type, and a merged view of upscaler features from all providers that list the game.

#### Scenario: Game supported by multiple providers
- **WHEN** "Black Myth: Wukong" appears in NVIDIA, AMD, and Intel provider data
- **THEN** the allowlist entry SHALL include feature data from all three providers (DLSS fields from NVIDIA, FSR fields from AMD, XeSS fields from Intel)

#### Scenario: Game supported by single provider
- **WHEN** a game appears only in the NVIDIA provider data
- **THEN** the allowlist entry SHALL include NVIDIA feature data with AMD and Intel fields absent or empty

### Requirement: Allowlist output format
The `data/allowlist.json` file SHALL be an array of objects sorted alphabetically by game name. Each object MUST include `gameName`, `stores` (object with store mappings), and `providers` (object with per-provider feature data). The JSON file SHALL use 2-space indentation and a trailing newline.

#### Scenario: Allowlist file structure
- **WHEN** `data/allowlist.json` is written
- **THEN** each entry SHALL follow the structure: `{ "gameName": "...", "stores": { "steam": { "appId": 12345 } }, "providers": { "nvidia": { ... }, "amd": { ... }, "intel": { ... } } }`

### Requirement: Allowlist is fully derived
The allowlist SHALL be regenerated from scratch every time it is run. It SHALL NOT be manually edited. The generation process is deterministic — given the same input files, it SHALL always produce the same output.

#### Scenario: Idempotent generation
- **WHEN** the allowlist generator runs twice with no changes to upstream data
- **THEN** `data/allowlist.json` SHALL have identical content both times
