## MODIFIED Requirements

### Requirement: Check anti-cheat safety for matched games
The system SHALL determine whether each game with a resolved store ID is safe to use with OptiScaler by checking if it uses any anti-cheat system at all. A game SHALL be considered unsafe if it uses ANY anti-cheat system, not just a predefined list of known ones, because any anti-cheat can block third-party DLL injection. The system SHALL NOT maintain an allowlist of specific "blocking" anti-cheat systems — the presence of any anti-cheat entry is sufficient to mark a game unsafe. The AWACY dataset's `status` field SHALL NOT be used in safety determination. Results SHALL be persisted to `data/anticheat/steam.json` keyed by store app ID.

#### Scenario: Game has no anti-cheat
- **WHEN** the checker finds a game in the AWACY dataset
- **AND** the game's `anticheats` list is empty
- **THEN** the entry SHALL have `safe` set to `true`

#### Scenario: Game has any anti-cheat system
- **WHEN** the checker finds a game in the AWACY dataset
- **AND** the game's `anticheats` list contains one or more entries (of any kind)
- **THEN** the entry SHALL have `safe` set to `false`

#### Scenario: Game has a novel or unknown anti-cheat system
- **WHEN** the checker finds a game in the AWACY dataset
- **AND** the game's `anticheats` list contains an anti-cheat system not previously known (e.g., "Javelin", or any future system)
- **THEN** the entry SHALL still have `safe` set to `false`, because all anti-cheat systems can block DLL injection

#### Scenario: Game not in AWACY dataset
- **WHEN** the checker does not find a game in the AWACY dataset
- **THEN** it SHALL fall back to the AI-based check to determine if the game uses any anti-cheat system
- **AND** the AI prompt SHALL make clear that any anti-cheat system means the game is unsafe, with no exceptions

#### Scenario: Game is anti-cheat safe via AI fallback
- **WHEN** the AI determines the game does not use any anti-cheat system
- **THEN** the entry SHALL have `safe` set to `true`, `source` set to `"ai"`, and `checkedAt` set to an ISO 8601 timestamp

#### Scenario: Game is not anti-cheat safe via AI fallback
- **WHEN** the AI determines the game uses any anti-cheat system
- **THEN** the entry SHALL have `safe` set to `false`, `source` set to `"ai"`, and `checkedAt` set to an ISO 8601 timestamp
