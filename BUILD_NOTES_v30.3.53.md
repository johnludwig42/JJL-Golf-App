# BUILD_NOTES_v30.3.53.md

Build v30.3.53 - Sneaky / Sandy / Poley Foundation

## Release Theme

Lay a safe, durable foundation for Sneaky / Sandy / Poley without changing existing scoring, settlement, Smart Score Advance, Shared Match, or saved-match behavior.

## Files Changed

- app.js
- style.css
- index.html
- manifest.json
- package.json
- package-lock.json
- service-worker.js
- docs/04_PRODUCT_BACKLOG.md
- docs/05_SNEAKY_SANDY_POLEY.md
- TECHNICAL_DEBT.md
- BUILD_NOTES_v30.3.53.md

## Changes Made

- Added Sneaky / Sandy / Poley as a selectable Match Setup game.
- Added SSP setup options for dollar value per point, Validate Greeny/Prox, Bridge/Re-Bridge, Umbee, and Umbee-with-Bridge.
- Disabled Smart Score Advance when SSP is active because SSP requires deliberate per-hole game/action inputs.
- Confirmed Quick Scoreboard remains available from the Play tab on desktop and mobile widths.
- Added SSP setup validation requiring exactly two equal teams, an even player count, and no more than four players per team.
- Added a backward-compatible SSP settings and per-hole input scaffold.
- Added a compact Play tab SSP Game Action section after score entry and before Stat Tracking.
- Added manual inputs for Sneaky, Sandy, Poley, Greeny, Prox, Bridge/Re-Bridge, and notes.
- Added inputs-only preview/status text and documented that final ledger and settlement are deferred.
- Updated release metadata from v30.3.52 to v30.3.53.

## Data Model

SSP setup is stored in `selectedGames` with key `sneaky_sandy_poley`:

```js
{
  key: 'sneaky_sandy_poley',
  enabled: true,
  pointValue: 1,
  validateGreenyProx: false,
  allowBridgeRebridge: false,
  allowUmbee: false,
  allowUmbeeWithBridge: false,
  version: 1
}
```

`pointValue` is the dollar value per point for later settlement. Per-hole manual inputs are stored at `match.sneakySandyPoleyInputs[holeNumber]` with player award booleans, `proxPlayerId`, `bridge`, `rebridge`, and `notes`.

## Known Limitations

- SSP full point ledger is not final in v30.3.53.
- Take/Keep is not scored yet.
- Bridge/Re-Bridge multiplier math is not scored yet.
- Umbee multiplier math is not scored yet.
- SSP settlement and Match Summary reporting are deferred.
- Shared Match score behavior is preserved, but SSP input reconciliation through cloud/shared match payloads is deferred.
- SSP preview is inputs-only and must not be treated as authoritative scoring.

## Deferred Work

- v30.3.54: SSP core hole ledger from manual inputs, Low Ball, Low Total, Birdie/Eagle, Validate, and team point totals.
- v30.3.55: Take/Keep, honors, Bridge/Re-Bridge, Umbee, settlement, Match Summary reporting, and regression coverage.

## Manual QA Notes

1. Start a new match without SSP enabled and confirm the Play tab does not show SSP.
2. Enable SSP and confirm setup options appear and save.
3. Try odd player count, more than two teams, unequal teams, and more than four per team to confirm validation.
4. Use valid 2v2 setup and confirm no SSP warning.
5. Confirm Smart Score Advance is disabled with the SSP-specific explanation.
6. Confirm Play tab SSP appears before Stat Tracking.
7. Confirm Sneaky, Sandy, Poley, Greeny, Prox, Bridge/Re-Bridge, and notes persist by hole.
8. Confirm Quick Scoreboard is available from the Play tab on desktop and mobile widths.
9. Save and reload the match and confirm SSP setup and inputs persist.
10. Confirm score entry, Smart Score Advance without SSP, Quick Scoreboard, Player Detail, Match Summary, existing games, and settlement still behave normally.

## Tests Run

- `node --check app.js` - PASS
- `node --check service-worker.js` - PASS
- `node scripts/release-sanity-check.js v30.3.53` - PASS, with expected dirty-tree warning
- `npm run release:sanity -- v30.3.53` - PASS, with expected dirty-tree warning
- `git diff --check` - PASS, with CRLF normalization warnings only
- `npm run test:shared-match` - PASS, 8 tests
- `npm run test:simulations` - PASS, 3 tests
- `npm run test:live-engine` - PASS, 4 tests
- `npm test` - PASS, 15 tests
- `npm run test:run` - PASS, 15 tests
- `npm run simulate` - PASS, 60 rounds, 0 failures, 43 warnings, 2 suspicious outcomes, 60/60 live-vs-mirror exact matches
- `npm run simulate:live` - PASS, 60 rounds, 0 failures, 43 warnings, 2 suspicious outcomes, 60/60 live-vs-mirror exact matches
- `npm run simulate:compare` - PASS, 60 rounds, 0 failures, 43 warnings, 2 suspicious outcomes, 60/60 live-vs-mirror exact matches
- `npm run simulate:100` - PASS, 110 rounds, 0 failures, 72 warnings, 2 suspicious outcomes, 110/110 live-vs-mirror exact matches

## Generated Report Cleanup

- Simulation commands regenerated `reports/simulation/latest-summary.md`.
- The generated report is not intentionally included in v30.3.53 and was reverted after validation.
