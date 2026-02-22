## 1. Fix core safety logic

- [x] 1.1 Remove the `SAFE_STATUSES` constant from `src/checkers/anticheat.ts`
- [x] 1.2 Remove the `statusSafe` variable and simplify the safety expression to `const safe = !hasBlockingAC`
- [x] 1.3 Remove the `status` field from the `AwacyGame` interface in `src/checkers/anticheat.ts`
- [x] 1.4 Update the JSDoc comment above the safety logic to reflect the new intent (no status override)

## 2. Update AI fallback prompt

- [x] 2.1 Add explicit statement to the AI prompt in `src/checkers/anticheat.ts`: "If the game uses ANY of these anti-cheat systems, it is NOT safe — there are no exceptions based on compatibility mode or platform support"

## 3. Update tests

- [x] 3.1 Change the test "should return safe=true for game with blocking AC but Supported status" in `src/checkers/anticheat.test.ts` to expect `safe: false` instead of `safe: true`
- [x] 3.2 Rename that test to "should return safe=false for game with blocking AC regardless of Supported status"
- [x] 3.3 Add a new test case: game with blocking AC and "Running" status should return `safe: false`
- [x] 3.4 Remove the `status` field from test fixtures where it is no longer needed by the interface

## 4. Invalidate misclassified data

- [x] 4.1 Remove all 4 AWACY-sourced entries (app IDs: 251570, 1808500, 2073620, 2399830) from `data/anticheat/steam.json`

## 5. Verify

- [x] 5.1 Run `npm test` and confirm all tests pass
- [x] 5.2 Run `npm run typecheck` and confirm no type errors
- [x] 5.3 Run `npm run lint` and confirm no lint errors
