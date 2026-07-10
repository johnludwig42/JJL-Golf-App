# BUILD_NOTES_v30.3.54.md

Build v30.3.54 - SSP Hole Inputs and Core Point Ledger

## Release Theme

Turn the v30.3.53 Sneaky / Sandy / Poley input foundation into a safe base-point ledger without adding settlement, advanced multipliers, Take/Keep, honors, or Shared Match SSP reconciliation.

## Files Changed

- app.js
- style.css
- index.html
- manifest.json
- package.json
- package-lock.json
- service-worker.js
- scripts/live-engine-adapter.js
- tests/live-engine-adapter.test.js
- tests/ssp-ledger.test.js
- docs/04_PRODUCT_BACKLOG.md
- docs/05_SNEAKY_SANDY_POLEY.md
- TECHNICAL_DEBT.md
- BUILD_NOTES_v30.3.54.md

## Changes Made

- Updated release metadata from v30.3.53 to v30.3.54.
- Added `buildSneakySandyPoleyLedger(match, options)` as the centralized non-mutating SSP base ledger helper.
- Calculated manual base points for Sneaky, Sandy, Poley, Greeny, and Prox.
- Calculated automatic base points for Birdie, Eagle, Low Ball, and Low Total.
- Preserved partial-hole safety: missing scores are incomplete, never zero.
- Added validation warnings for unavailable stats, invalid manual selections, incomplete holes, and Validate Greeny/Prox requirements.
- Replaced the Play tab SSP inputs-only status with a current-hole Base Points preview.
- Added SSP base status to Quick Scoreboard active-game summaries on desktop and mobile.
- Added an SSP base-point contribution row to Player Detail when a player has contributing SSP points.
- Restricted the Prox selector to players with Greeny selected on the current hole and clears invalid Prox selections when Greeny is unchecked.
- Refined Prox to use None with zero Greenies, auto-select the only Greeny, and use TBD when multiple Greenies require scorer confirmation.
- Moved the Optional SSP note lower in the Play tab flow, after SSP inputs/base ledger and Stat Tracking, just before Save Hole Scores.
- Cleaned up Sneaky validation messaging so missing GIR/putt stats do not create developer-style Play tab warnings.
- Grouped Hole Base Points detail by team under the existing team summary.
- Shortened the Quick Scoreboard Active Games label to `SSP`.
- Formatted `$ per point` as currency in Match Setup and Play tab stake text.
- Updated Play tab scoring rows to show compact tee plus current-hole yardage.
- Combo tee display now resolves the hole-specific source tee and yardage without showing Combo or C.
- Updated the live-engine adapter export surface and tests to include the SSP ledger helper.
- Added focused SSP ledger regression tests and an `npm run test:ssp` script.

## Ledger Scope

The v30.3.54 ledger is derived from saved match state and does not persist authoritative calculated SSP results back onto the match.

The helper returns enabled state, normalized settings, teams, per-hole category entries, team totals, a leader summary, and warnings. It intentionally stops at base points.

## Validation Behavior

- Sneaky is manual/scorer-confirmed and requires a gross par; missing GIR/putt stats do not create Play tab warning noise.
- Sandy requires the same player to have Sneaky on that hole and make par.
- Poley requires the selected player to finish no worse than two-over par.
- Greeny is manual unless Validate Greeny/Prox is enabled, then eligible putt data is required.
- Prox requires a valid player, an eligible team, a matching Greeny selection, and, when Validate is enabled, eligible putt data. The Play tab selector uses None for zero Greenies, auto-selects the only Greeny, and uses TBD for multiple Greenies until the scorer chooses one.
- Low Ball and Low Total use net scores only after enough scores exist to evaluate the category safely.

## Known Limitations

- SSP settlement is not implemented in v30.3.54.
- Take/Keep is not implemented.
- Honors indicators and carry-forward are not implemented.
- Bridge/Re-Bridge multiplier math is not implemented.
- Umbee multiplier math is not implemented.
- Match Summary SSP reporting is deferred.
- Shared Match SSP input reconciliation is deferred.

## Deferred Work

- v30.3.55: Take/Keep, honors, Bridge/Re-Bridge, Umbee, settlement, Match Summary reporting, Shared Match SSP input reconciliation, and expanded regression coverage.

## Manual QA Notes

1. Enable SSP in a valid 2v2 match and confirm Smart Score Advance remains disabled with the SSP explanation.
2. Enter SSP manual hole inputs and confirm the Play tab Base Points preview updates for the current hole.
3. Confirm Quick Scoreboard shows SSP base status in Active Games on desktop and mobile widths.
4. Open Player Detail for a contributing player and confirm the SSP contribution row appears.
5. Enter partial scores and confirm Low Ball / Low Total do not treat missing scores as zero.
6. Toggle Validate Greeny/Prox and confirm warnings appear when required putt data is missing.
7. Check and uncheck Greeny and confirm the Prox selector moves between None, auto-selected Prox, and TBD.
8. Confirm multiple Greenies require a deliberate Prox selection before Prox points award.
9. Confirm the Optional SSP note appears below Stat Tracking and just before Save Hole Scores.
10. Confirm Play tab score rows show compact tee plus current-hole yardage, including resolved combo source tees.

## Tests Run

- `node --check app.js` - PASS
- `node --check service-worker.js` - PASS
- `node scripts/release-sanity-check.js v30.3.54` - PASS, with expected dirty-tree warning
- `npm run release:sanity -- v30.3.54` - PASS, with expected dirty-tree warning
- `git diff --check` - PASS, with CRLF normalization warnings only
- `npm run test:shared-match` - PASS, 8 tests
- `npm run test:simulations` - PASS, 3 tests
- `npm run test:live-engine` - PASS, 4 tests
- `npm run test:ssp` - PASS, 10 tests
- `npm test` - PASS, 25 tests
- `npm run test:run` - PASS, 25 tests
- `npm run simulate` - PASS, 60 rounds, 0 failures, 43 warnings, 1 suspicious outcome, 60/60 live-vs-mirror exact matches
- `npm run simulate:live` - PASS, 60 rounds, 0 failures, 43 warnings, 1 suspicious outcome, 60/60 live-vs-mirror exact matches
- `npm run simulate:compare` - PASS, 60 rounds, 0 failures, 43 warnings, 1 suspicious outcome, 60/60 live-vs-mirror exact matches
- `npm run simulate:100` - PASS, 110 rounds, 0 failures, 84 warnings, 1 suspicious outcome, 110/110 live-vs-mirror exact matches

## Generated Report Cleanup

- Simulation commands regenerated `reports/simulation/latest-summary.md`.
- The generated report is not intentionally included in v30.3.54 and was reverted after validation.
