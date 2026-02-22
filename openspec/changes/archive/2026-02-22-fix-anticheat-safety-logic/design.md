## Context

The anti-cheat checker (`src/checkers/anticheat.ts`) uses the AreWeAntiCheatYet (AWACY) dataset as its primary source for determining whether a game's anti-cheat blocks DLL injection. The current logic on line 79 is:

```typescript
const safe = !hasBlockingAC || statusSafe;
```

Where `statusSafe` checks if the AWACY `status` field is "Supported" or "Running". These statuses track whether a game's anti-cheat works on Linux/Proton — a completely different concern from whether the anti-cheat blocks DLL injection on Windows. OptiScaler injects DLLs to replace upscaler implementations, and blocking anti-cheat systems prevent this regardless of their Linux compatibility.

There are currently 4 AWACY-sourced entries in `data/anticheat/steam.json` (app IDs: 251570, 1808500, 2073620, 2399830), all marked `safe: true`. Any of these that have blocking anti-cheat in AWACY were potentially misclassified.

## Goals / Non-Goals

**Goals:**
- Fix the safety determination so any game with a blocking anti-cheat is marked unsafe, no exceptions
- Remove the `SAFE_STATUSES` concept entirely from the codebase
- Ensure the AI fallback prompt is unambiguous about blocking AC = unsafe
- Invalidate AWACY-sourced entries that may have been misclassified so they get re-checked

**Non-Goals:**
- Changing which anti-cheat systems are in the `BLOCKING_ANTICHEATS` set (the list is correct)
- Changing the two-tier architecture (AWACY primary, AI fallback) — this is still sound
- Modifying the `AwacyGame` interface or the AWACY fetch/cache mechanism
- Changing the anti-cheat data schema, types, or output format
- Modifying the allowlist generator or any other pipeline stages

## Decisions

### Decision 1: Remove `SAFE_STATUSES` entirely rather than making it empty

**Choice:** Delete the `SAFE_STATUSES` constant and all code that references it. Simplify the safety expression to `const safe = !hasBlockingAC`.

**Alternative considered:** Keep `SAFE_STATUSES` as an empty set. Rejected because dead code is misleading — it implies the concept might be used in the future. Removing it makes the intent clear: AWACY status is architecturally irrelevant to safety.

### Decision 2: Delete AWACY-sourced entries from `data/anticheat/steam.json` to force re-check

**Choice:** Remove all 4 entries with `source: "areweanticheatyet.com"` from the data file. On the next `check` run, they'll be picked up as new app IDs and re-evaluated with the corrected logic.

**Alternative considered:** Manually inspect each entry against the AWACY dataset to determine if they actually have blocking AC. Rejected because it's error-prone and the automated re-check is the same mechanism the pipeline already uses — it'll produce the correct result with the fixed logic. The cost is 4 re-checks, which is trivial.

### Decision 3: Tighten the AI fallback prompt

**Choice:** Update the AI prompt to explicitly state: "If the game uses ANY of these anti-cheat systems, it is NOT safe — there are no exceptions based on compatibility mode or platform support." The current prompt is not wrong, but adding this explicit statement reduces the chance of an LLM reasoning its way into an incorrect override.

**Alternative considered:** Leave the AI prompt unchanged since it already asks the right question. Rejected because the same conceptual error we're fixing (status override) could be replicated by an LLM that knows about Linux compatibility.

### Decision 4: Remove the `status` field from the `AwacyGame` interface

**Choice:** Remove the `status` field from the `AwacyGame` interface since it is no longer read or used anywhere. Keeping unused fields in the interface is misleading.

**Alternative considered:** Keep `status` in the interface for documentation purposes. Rejected because it invites future misuse — if someone sees `status` available on the match object, they might reintroduce the bug.

## Risks / Trade-offs

**[Risk] AWACY-sourced entries that were correctly safe get temporarily removed from the allowlist.** → The 4 deleted entries will be re-checked on the next pipeline run. If they're genuinely safe (no blocking AC), they'll be re-added within one cycle. The gap is at most one daily cron run.

**[Risk] Some games in AWACY have anti-cheat systems not in our `BLOCKING_ANTICHEATS` set.** → This is pre-existing and out of scope for this change. The set covers the major injection-blocking systems. Unknown anti-cheat systems fall through to the "no blocking AC found" path, which defaults to safe — same as before.

**[Trade-off] Simpler logic means no nuance for edge cases.** → This is intentional. The previous "nuance" (AWACY status override) was based on an incorrect premise. For OptiScaler's use case, the binary question "does it have blocking AC?" is the correct one.
