## Why

The anti-cheat safety logic incorrectly uses the AreWeAntiCheatYet (AWACY) `status` field ("Supported", "Running") to override blocking anti-cheat detection. These statuses indicate whether a game's anti-cheat works on Linux/Proton — not whether DLL injection is possible on Windows. A game with EAC that "runs" on Proton still blocks OptiScaler DLL injection. Any game with a blocking anti-cheat system (EAC, BattlEye, Vanguard, etc.) must be marked unsafe regardless of its AWACY status.

## What Changes

- **BREAKING**: Remove the `SAFE_STATUSES` override from AWACY-based safety determination. The logic changes from `safe = !hasBlockingAC || statusSafe` to `safe = !hasBlockingAC`. Games previously marked safe due to "Supported"/"Running" status despite having blocking anti-cheat will now correctly be marked unsafe.
- Update the AI fallback prompt to be explicit that any presence of a blocking anti-cheat means unsafe, with no exceptions for "compatibility" status.
- Invalidate and re-check existing `data/anticheat/steam.json` entries that were sourced from AWACY with `safe: true` but may have blocking anti-cheat (these were potentially incorrectly classified).
- Update tests to reflect the corrected logic.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `anticheat-checking`: The safety determination requirement changes — any game with a blocking anti-cheat system is unsafe, period. The AWACY dataset is still used to detect which anti-cheat systems a game uses, but its Linux/Proton compatibility status is no longer considered.

## Impact

- **`src/checkers/anticheat.ts`**: Core logic change — remove `SAFE_STATUSES` and simplify safety expression.
- **`src/checkers/anticheat.test.ts`**: Update test cases — the "safe despite blocking AC due to status" scenario should now return `safe: false`.
- **`data/anticheat/steam.json`**: Existing AWACY-sourced entries with blocking anti-cheat may flip from `safe: true` to `safe: false`. These entries should be cleared and re-checked, or manually corrected.
- **`data/allowlist.json`**: Downstream effect — games that were incorrectly allowed will be removed from the allowlist on next generation.
- No changes to types, schemas, workflows, or other pipeline stages.
