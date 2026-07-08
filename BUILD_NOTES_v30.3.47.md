# BUILD_NOTES_v30.3.47.md

Build v30.3.47 - Live Competition Engine Adapter

## Release Theme
Live Competition Engine Adapter: connect the Simulation Lab to the live app scoring and settlement functions without redesigning UI, Shared Match, saved data, or the competition engine.

## Objective
Restore the Simulation Lab on the v30.3.47 branch and reduce the mirrored-engine limitation by letting Node-based simulations load `app.js` in a guarded VM adapter mode, seed app-native match state, and call the live competition/payout functions used by the browser app.

## Files Changed
- `app.js`
- `package.json`
- `package-lock.json`
- `manifest.json`
- `service-worker.js`
- `scripts/simulation-engine.js`
- `scripts/simulation-report.js`
- `scripts/simulate-rounds.js`
- `scripts/live-engine-adapter.js`
- `tests/fixtures/rounds/simulation-fixtures.js`
- `tests/simulation-lab.test.js`
- `tests/live-engine-adapter.test.js`
- `reports/simulation/latest-summary.md`
- `BUILD_NOTES_v30.3.47.md`

## Adapter Strategy Chosen
- Added a guarded `DYE_LEDGER_ADAPTER_MODE` path in `app.js`.
- Normal browser/PWA startup is unchanged unless `window.__DYE_LEDGER_LIVE_ENGINE_ADAPTER__` is explicitly set by the Node VM harness.
- The adapter loads `app.js` with a minimal browser shim, prevents app bootstrapping, seeds the app's in-memory `state`, and exposes a narrow `window.__DYE_LEDGER_LIVE_ENGINE__` API.
- Simulation fixtures use `match_play`; the adapter maps that to the live app's `team_match` payout path and normalizes the result back for comparison.

## Live Functions Covered
- `normalizeMatch`
- `computeMatchMetrics`
- `computeLivePayoutGames`
- `getPayoutReportContext`
- `optimalSettlementRows`
- `computeTeamGameDiffs`
- `computeNassauDiffsForBasis`
- `computeSkinResults`
- `computeNinePointResults`

## Mirrored Functions Still Used
- Fixture generation and random round generation.
- Simulation invariant checks.
- Live-vs-mirror difference classification.

## Unsupported / Transitional Areas
- Browser-rendered Match Summary markup is not rendered in the adapter.
- Real localStorage save/reload I/O is still modeled, not browser-tested.
- Shared Match cloud sync and two-device browser behavior remain outside this Node adapter.
- iPhone PWA service-worker lifecycle remains a manual acceptance area.

## Commands Added or Changed
- Added `npm run simulate`.
- Added `npm run simulate:100`.
- Added `npm run test:simulations`.
- Added `npm run test:live-engine`.
- Added `npm run simulate:live`.
- Added `npm run simulate:compare`.
- Updated `npm test` to run both Simulation Lab and live adapter tests.

## Fixture Results
- 10 deterministic fixtures passed mirrored invariants.
- 10 deterministic fixtures matched live adapter output exactly.
- Fixture live-vs-mirror differences: 0.

## Random Simulation Results
- `npm run simulate`: 60 total rounds, 0 failures, 46 warnings, 2 suspicious outcomes, 60 exact live-vs-mirror matches.
- `npm run simulate:100`: 110 total rounds, 0 failures, 82 warnings, 2 suspicious outcomes, 110 exact live-vs-mirror matches.
- Suspicious outcomes are high-dollar settlement review flags, not invariant failures.

## Live-vs-Mirror Comparison Results
- Final totals matched exactly across the final 110-round run.
- Final settlement rows matched exactly across the final 110-round run.
- Game-level payout amounts matched exactly for Match Play, Nassau, Gross Skins, Net Skins, and 9-Point.
- Live-vs-mirror differences in `reports/simulation/latest-summary.md`: 0.

## Validation Commands Run
- `node --check app.js` - passed.
- `node --check service-worker.js` - passed.
- `node --check scripts/simulation-engine.js` - passed.
- `node --check scripts/simulation-report.js` - passed.
- `node --check scripts/simulate-rounds.js` - passed.
- `node --check scripts/live-engine-adapter.js` - passed.
- `npm run simulate` - passed.
- `npm run simulate:100` - passed.
- `npm run simulate:live` - passed.
- `npm run simulate:compare` - passed.
- `npm run test:simulations` - passed.
- `npm run test:live-engine` - passed.
- `npm test` - passed.
- `npm run test:run` - passed.
- `git diff --check` - passed with line-ending normalization warnings only.

## Failed Commands and Reasons
- `npm run lint` - failed because `eslint` is not installed/available on PATH in this working copy.
- `npm run validate` - failed because `scripts/validate-release.js` does not exist.
- `npm run test:money` - failed because `tests/money-math.test.js` does not exist.

## Manual Review Instructions
From the repository root:

```bash
npm run simulate
npm run simulate:100
npm run test:simulations
npm run test:live-engine
npm run simulate:live
npm run simulate:compare
```

The generated report is:

```text
reports/simulation/latest-summary.md
```

Use `npm run simulate:compare -- --seed your-seed --rounds 75` to compare a different deterministic run.

## Known Limitations
- The adapter validates live scoring and settlement calculations, not visual rendering.
- Save/reload normalization is still represented by cloned data rather than actual browser storage I/O.
- Shared Match assignment shape is still tested at model level; cloud sync and real multi-device flows need browser/device automation or manual testing.
- The adapter intentionally avoids a broad `app.js` refactor.

## Recommended Next Release
Add fixture-specific golden expected outcomes and saved-match compatibility fixtures now that the live adapter can compare real engine output. A later release should add browser automation for Match Summary rendering and Shared Match host/joined-device flows.
