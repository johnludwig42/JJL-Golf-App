# BUILD_NOTES_v30.3.52.md

Build v30.3.52 - Play Tab Acceptance, Primary Match Status & Scorecard Polish

## Release Theme
Make the Play tab more trusted, readable, and match-aware before adding new game complexity.

## Files Changed
- app.js
- style.css
- index.html
- manifest.json
- package.json
- package-lock.json
- service-worker.js
- BUILD_NOTES_v30.3.52.md

## Changes Made
- Added compact Play tab Primary Match status below the hole facts and above scoring rows.
- Updated live match-play display language to leader-side `Name +X thru Y` or `Tied thru Y` in the Play status, Quick Scoreboard, and Player Detail Games / Action where safe.
- Adjusted Play scoring row widths to give Player names slightly more room while keeping Gross controls usable and Str/Net equal width.
- Polished Quick Scoreboard columns: smaller rank column, wider Player column, and equal Gross / Net / Net +/- columns.
- Added a compact Quick Scoreboard Active Games section using existing computed game state.
- Updated Player Detail Classic Scorecard subtotals so empty nines show a dash and totals derive from the same visible scored holes used by Out/In.

## Bugs Fixed
- Fixed Player Detail empty-nine display so unplayed front/back nines show a dash instead of `0`.
- Fixed a scorecard total display risk where total columns could disagree with visible front/back subtotals by relying on precomputed aggregate player totals.
- Preserved player-specific yardage, combo tee display behavior, score entry, Smart Score Advance, and Shared Match reconciliation behavior.

## Scorecard Total Investigation
- Reviewed Classic Scorecard rendering in Scores and Player Detail, Quick Scoreboard standings, Match Summary leaderboard/teams, and selected game summary displays.
- The highest-risk inconsistency was in `buildClassicScorecard`: front/back values were calculated from visible per-hole cells, while the Total column used precomputed player totals.
- v30.3.52 makes Classic Scorecard player row Out/In/Total derive from the same visible scored holes.
- Unscored holes are not counted as zero. If one nine has no scored holes, that nine displays a dash; Total equals the subtotal of scored holes.
- No settlement math, handicap stroke allocation, score persistence, Shared Match reconciliation, yardage logic, or tee/combo tee resolution logic was intentionally changed.

## Known Limitations
- No live browser/iPhone visual automation was added in this pass.
- Active Games status is intentionally compact and uses safe existing computed state; unsupported or not-yet-started game state may display conservatively.
- Full manual iPhone SE acceptance remains recommended before commit.

## Test Coverage Notes
- No new automated tests were added in this pass because the changes are version metadata, display formatting, CSS layout, Quick Scoreboard presentation, and Classic Scorecard display derivation from existing hole data.
- Existing syntax, release sanity, shared-match, live-engine, simulation unit tests, full test runner, and full simulation suite were run to confirm no intentional scoring, settlement, Smart Score Advance, or Shared Match reconciliation behavior changed.

## Manual QA Notes
1. Create or open a match with a Primary Match selected.
2. Confirm Play tab shows primary match status below hole selector/hole information.
3. Enter scores across several holes and confirm match status updates.
4. Confirm match-play status uses `Team/Player +X thru Y` or `Tied thru Y`.
5. Open Quick Scoreboard.
6. Confirm Player column has more width.
7. Confirm Gross, Net, and Net +/- columns are equal width.
8. Confirm selected games show current status.
9. Open Player Detail before any back-nine holes are scored.
10. Confirm back nine shows `—`, not `0`.
11. Confirm front/back/total math is correct when one or both nines are partially scored.
12. Test long player names on iPhone width.
13. Confirm Smart Score Advance still works.
14. Confirm no horizontal clipping on iPhone SE width.

## Tests Run
- `node --check app.js` - PASS
- `node --check service-worker.js` - PASS
- `node scripts/release-sanity-check.js v30.3.52` - PASS, with expected dirty-tree warning
- `npm run release:sanity -- v30.3.52` - PASS, with expected dirty-tree warning
- `npm run test:shared-match` - PASS, 8 tests
- `npm run test:simulations` - PASS, 3 tests
- `npm run test:live-engine` - PASS, 4 tests
- `npm test` - PASS, 15 tests
- `npm run test:run` - PASS, 15 tests
- `npm run simulate` - PASS, 60 rounds, 0 failures, 47 warnings, 1 suspicious outcome, 60/60 live-vs-mirror exact matches
- `npm run simulate:live` - PASS, 60 rounds, 0 failures, 47 warnings, 1 suspicious outcome, 60/60 live-vs-mirror exact matches
- `npm run simulate:compare` - PASS, 60 rounds, 0 failures, 47 warnings, 1 suspicious outcome, 60/60 live-vs-mirror exact matches
- `npm run simulate:100` - PASS, 110 rounds, 0 failures, 87 warnings, 1 suspicious outcome, 110/110 live-vs-mirror exact matches
- `git diff --check` - PASS, with existing CRLF normalization warnings only

## Generated Report Cleanup
- Simulation commands regenerated `reports/simulation/latest-summary.md`.
- The generated report is not intentionally included in v30.3.52 and was reverted after validation.
