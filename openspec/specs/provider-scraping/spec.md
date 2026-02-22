## ADDED Requirements

### Requirement: Fetch NVIDIA game data from JSON API
The system SHALL fetch game data from the NVIDIA JSON API endpoint at `https://www.nvidia.com/content/dam/en-zz/Solutions/geforce/news/nvidia-rtx-games-engines-apps/dlss-rt-games-apps-overrides.json` and extract entries where `type === "Game"`. For each game, the system SHALL capture: game name, DLSS Multi Frame Generation support, DLSS Frame Generation support, DLSS Super Resolution support, DLSS Ray Reconstruction support, DLAA support, and Ray Tracing support. The system SHALL normalize the raw values (`""`, `"Yes"`, `"NV"`, `"NV, U"`, `"NV, T"`, `"Full RT"`) into a consistent schema.

#### Scenario: Successful NVIDIA fetch
- **WHEN** the NVIDIA scraper runs
- **THEN** it fetches the JSON endpoint and writes `data/providers/nvidia.json` containing only entries with `type === "Game"`, each with a `gameName` string and boolean/enum fields for each DLSS feature

#### Scenario: NVIDIA API returns non-200 status
- **WHEN** the NVIDIA JSON endpoint returns a non-200 HTTP status
- **THEN** the scraper SHALL throw a typed `ScraperError` with the provider name and HTTP status code

#### Scenario: NVIDIA data filters out non-game entries
- **WHEN** the JSON response contains entries with `type === "App"`
- **THEN** those entries SHALL be excluded from the output file

### Requirement: Fetch AMD game data from HTML page
The system SHALL fetch the AMD FidelityFX supported games page at `https://www.amd.com/en/products/graphics/technologies/fidelityfx/supported-games.html` and extract game names from the FSR "Redstone", FSR 3, and FSR 2 tabbed sections. For each game, the system SHALL record which FSR versions it supports and whether it has FSR Frame Generation (ML) support. Since the page is HTML with dynamically rendered tab content, the system SHALL use AI-assisted parsing to extract the game lists from each section.

#### Scenario: Successful AMD fetch
- **WHEN** the AMD scraper runs
- **THEN** it fetches the HTML page, extracts game names from the Redstone, FSR 3, and FSR 2 sections, and writes `data/providers/amd.json` with each game listing its supported FSR versions and frame generation ML support

#### Scenario: AMD page structure changes
- **WHEN** AI-assisted parsing cannot identify the expected tabbed sections
- **THEN** the scraper SHALL throw a typed `ScraperError` indicating the page structure may have changed, including the URL and the missing section identifiers

### Requirement: Fetch Intel game data from HTML page
The system SHALL fetch the Intel XeSS enabled games page at `https://game.intel.com/us/xess-enabled-games/` and extract game names from the "XeSS 2 enabled games" and "XeSS enabled games" sections. For each game, the system SHALL record which XeSS version it supports. Since the page is WordPress/Elementor-based HTML, the system SHALL use AI-assisted parsing to extract the game lists.

#### Scenario: Successful Intel fetch
- **WHEN** the Intel scraper runs
- **THEN** it fetches the HTML page, extracts game names from both XeSS sections, and writes `data/providers/intel.json` with each game listing its supported XeSS versions

#### Scenario: Intel page structure changes
- **WHEN** AI-assisted parsing cannot identify the expected sections
- **THEN** the scraper SHALL throw a typed `ScraperError` indicating the page structure may have changed

### Requirement: Provider data output follows a consistent schema
Each provider JSON output file SHALL be an array of objects. Every object MUST have a `gameName` field (string). Provider-specific fields SHALL use camelCase keys. The JSON files SHALL use 2-space indentation and a trailing newline.

#### Scenario: NVIDIA output schema
- **WHEN** `data/providers/nvidia.json` is written
- **THEN** each entry SHALL have: `gameName` (string), `dlssMultiFrameGeneration` (string), `dlssFrameGeneration` (string), `dlssSuperResolution` (string), `dlssRayReconstruction` (string), `dlaa` (string), `rayTracing` (string)

#### Scenario: AMD output schema
- **WHEN** `data/providers/amd.json` is written
- **THEN** each entry SHALL have: `gameName` (string), `fsrRedstone` (boolean), `fsr3` (boolean), `fsr2` (boolean), `fsrFrameGenerationMl` (boolean)

#### Scenario: Intel output schema
- **WHEN** `data/providers/intel.json` is written
- **THEN** each entry SHALL have: `gameName` (string), `xess2` (boolean), `xess` (boolean)

### Requirement: Scrapers preserve existing data on partial failure
When a scraper succeeds for some providers but fails for others, the system SHALL NOT overwrite or delete the JSON files of providers that were not re-scraped. Each provider's scraper SHALL operate independently on its own output file.

#### Scenario: One provider fails while others succeed
- **WHEN** the NVIDIA scraper succeeds but the AMD scraper throws a `ScraperError`
- **THEN** `data/providers/nvidia.json` SHALL be updated AND `data/providers/amd.json` SHALL remain unchanged from its last successful run
