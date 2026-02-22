## ADDED Requirements

### Requirement: TypeScript project with strict ESM configuration
The project SHALL use TypeScript in strict mode with ESM modules. `package.json` SHALL set `"type": "module"` and `tsconfig.json` SHALL set `"strict": true`, `"module": "NodeNext"`, and `"moduleResolution": "NodeNext"`. The project SHALL target Node.js >= 20.

#### Scenario: TypeScript compiles without errors
- **WHEN** `npm run build` is executed
- **THEN** TypeScript SHALL compile all files in `src/` to `dist/` with zero errors

#### Scenario: Strict mode catches type issues
- **WHEN** a source file uses `any` without explicit opt-out
- **THEN** the TypeScript compiler SHALL report an error

### Requirement: Biome for linting and formatting
The project SHALL use Biome for both linting and formatting. A `biome.json` config file SHALL be present at the project root. `npm run lint` SHALL check for issues and `npm run format` SHALL auto-format.

#### Scenario: Lint check passes on clean code
- **WHEN** `npm run lint` is executed on code that follows project conventions
- **THEN** it SHALL exit with code 0 and no warnings

#### Scenario: Format is enforced
- **WHEN** `npm run format` is executed
- **THEN** all files in `src/` SHALL be formatted according to Biome rules

### Requirement: Vitest for testing
The project SHALL use Vitest as the test runner. `npm test` SHALL run all tests. Test files SHALL be co-located with source files using the `*.test.ts` naming convention.

#### Scenario: Run all tests
- **WHEN** `npm test` is executed
- **THEN** Vitest SHALL discover and run all `*.test.ts` files in `src/`

#### Scenario: Run single test file
- **WHEN** `npx vitest run src/path/to/file.test.ts` is executed
- **THEN** Vitest SHALL run only that specific test file

### Requirement: npm scripts for all pipeline stages
`package.json` SHALL define scripts for: `build`, `lint`, `lint:fix`, `format`, `test`, `test:watch`, `typecheck`, and `ci` (which runs typecheck, lint, and test in sequence).

#### Scenario: CI script runs all checks
- **WHEN** `npm run ci` is executed
- **THEN** it SHALL run typecheck, lint, and test in sequence, and fail if any step fails

### Requirement: Shared types for pipeline data
The project SHALL define TypeScript interfaces for all data structures used across the pipeline: provider entries (per-provider schemas), store mappings, anti-cheat results, and allowlist entries. These SHALL live in `src/types/`.

#### Scenario: Type definitions are importable
- **WHEN** a scraper module imports a provider entry type from `src/types/`
- **THEN** TypeScript SHALL resolve the import and enforce the type at compile time

### Requirement: Custom error types for pipeline stages
The project SHALL define typed error classes for each pipeline stage: `ScraperError`, `MatcherError`, `CheckerError`. Each SHALL extend `Error` and include contextual fields (provider name, HTTP status, game name, etc.).

#### Scenario: ScraperError includes context
- **WHEN** a scraper throws a `ScraperError`
- **THEN** the error SHALL include the `provider` name, a descriptive `message`, and optionally the HTTP `statusCode`
