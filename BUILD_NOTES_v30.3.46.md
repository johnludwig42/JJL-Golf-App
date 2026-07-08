# BUILD_NOTES_v30.3.46.md

Build v30.3.46 - Simulation Lab & Regression Harness

## Release Theme
Simulation Lab & Regression Harness: create reusable engineering-learning infrastructure for realistic golf round simulation, deterministic fixtures, settlement invariant checks, and readable product findings.

## Objective
Give future Codex sessions one command that can generate realistic rounds, rerun named fixtures, validate core scoring and settlement invariants, and produce a report about correct behavior, suspicious outcomes, and high-ROI follow-up work.

## Files Changed
- app.js
- package.json
- package-lock.json
- manifest.json
- service-worker.js
- scripts/simulation-engine.js
- scripts/simulation-report.js
- scripts/simulate-rounds.js
- tests/simulation-lab.test.js
- tests/fixtures/rounds/simulation-fixtures.js
- reports/simulation/latest-summary.md
- BUILD_NOTES_v30.3.46.md

## Simulation Framework Summary
- Added a plain Node Simulation Lab for deterministic and seeded random golf rounds.
- Supports 4 players, 2 teams, 18-hole rounds, 9-hole rounds, incomplete rounds, handicaps, close matches, blowouts, ties, net/gross outcomes, save/reload-style normalization checks, and modeled assigned-player Shared Match scenarios.
- Covers current competition formats requested for this release: Match Play, Nassau, Gross Skins, Net Skins, 9-Point, and Final Net Settlement across multiple games.
- Generates realistic gross scores with pars, bogeys, doubles, occasional birdies, and blow-up holes.
- Uses deterministic seed support; default seed is `dye-ledger-v30.3.46-default`.
- Writes a readable markdown findings report to `reports/simulation/latest-summary.md`.

## npm Scripts Added / Updated
- `npm run simulate`
- `npm run simulate:100`
- `npm run test:simulations`
- Updated `npm test` to run the new simulation test file directly.

## Fixture List
1. close_match_18
2. blowout_match_play
3. nassau_front_back_split
4. gross_skins_carryover
5. net_skins_handicap_stroke
6. nine_point_tie_scenarios
7. incomplete_round_7_holes
8. save_reload_mid_round
9. shared_match_two_device_assignment_model
10. host_correction_after_joiner_score

## Invariant Checks Added
- Final Net Settlement nets to zero.
- Game-level payouts reconcile to final settlement totals.
- Settlement does not change after save/reload-style normalization.
- Scores do not change after save/reload-style normalization.
- Final settlement does not contain reciprocal payment rows.
- Nassau front/back components reconcile to overall.
- Incomplete rounds produce provisional warnings.
- Gross Skins and Net Skins are awarded only for unique low scores on the relevant basis.
- 9-Point allocates exactly 9 points per completed hole.
- 9-Point total points equal 9 times completed holes.
- Assigned-player Shared Match model rejects unknown players and stale participants.

## Simulation Results
- `npm run simulate` completed 60 rounds: 10 fixtures and 50 random rounds.
  - Failures: 0
  - Warnings: 47
  - Suspicious outcomes: 1
- `npm run simulate:100` completed 110 rounds: 10 fixtures and 100 random rounds.
  - Failures: 0
  - Warnings: 87
  - Suspicious outcomes: 1
- The suspicious outcome was the intentional blowout fixture producing a settlement row over $100; this is flagged for product review, not treated as an invariant failure.
- Most warnings identify either incomplete-round provisional output or post-clinch Match Play score entry behavior that should remain intentional and explainable.

## Validation Commands Run
- `node --check app.js` - passed.
- `node --check service-worker.js` - passed.
- `node --check scripts/simulation-engine.js` - passed.
- `node --check scripts/simulation-report.js` - passed.
- `node --check scripts/simulate-rounds.js` - passed.
- `npm run simulate` - passed; generated `reports/simulation/latest-summary.md`.
- `npm run simulate:100` - passed; updated `reports/simulation/latest-summary.md`.
- `npm run test:simulations` - passed.
- `npm test` - passed after updating the script to run `tests/simulation-lab.test.js`.
- `npm run test:run` - passed; aliases `npm test`.
- `git diff --check` - passed; Git reported line-ending normalization warnings only.
- Stale active-version search for `v30.3.45` / `30.3.45` in app, manifest, service worker, package, and lock files - passed.

## Failed Commands and Reasons
- `npm run lint` - failed because `eslint` is not installed/available in this working copy.
- `npm run validate` - failed because `scripts/validate-release.js` does not exist in this working copy.
- `npm run test:money` - failed because `tests/money-math.test.js` does not exist in this working copy.

## Known Limitations
- The Simulation Lab is a DOM-free Node harness that mirrors current intended rules; it does not yet import the live browser-global scoring functions from `app.js`.
- Shared Match coverage is model-level only. It checks assignment shape and stale participant cases, but does not replace real host/joined-device browser automation or manual two-device testing.
- Deterministic fixtures currently prioritize invariant correctness. More fixture-specific golden expected outcomes should be added after product-owner review confirms exact business expectations.
- Current skins validation reflects the app's current unique-low-hole behavior. Carryover-specific product rules should be documented more formally if carryovers become explicit.

## Manual Review Instructions
From the repository root:

```bash
npm run simulate
npm run simulate:100
npm run test:simulations
```

The latest generated product findings report is:

```text
reports/simulation/latest-summary.md
```

Use `npm run simulate -- --seed your-seed --rounds 75` to rerun with a different deterministic seed and round count.

## Recommended Next Release
Create a DOM-free competition-engine adapter or extracted scoring module so future simulations can call the live app scoring and settlement functions directly, then add golden expected outcomes for the named fixtures.
