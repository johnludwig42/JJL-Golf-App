# The Dye Ledger v30.3.74

## Release objective

Make Scores the definitive, frozen-safe competition and settlement view: outcome first, lifecycle state explicit, game and money contributions explainable, and supporting evidence easy to reach.

## Scores product role and hierarchy

- Scores now opens with the lifecycle and competition outcome before share/export actions.
- The hero identifies Live, Final, Reopened for Correction, Clinched Early · Final, or Ended Early · Provisional state, holes completed, leader/winner/tie, money position, and visible missing-score status.
- Share / Save PDF remains available as a supporting action lower in the visual hierarchy. Match Summary remains the primary shareable report.
- Completed Scores resolves an effective result context and consumes a valid frozen RoundRecord for player, team, game, and settlement facts. New frozen records preserve team identity and totals; older valid frozen records derive team totals read-only from frozen players and holes. Completed rounds without any valid frozen record use an explicitly labelled legacy compatibility fallback.

## Settlement and result presentation

- Active payment routes use “would pay” and Provisional Settlement.
- Final payment routes use “pays” and Final Net Settlement.
- Player balances include text equivalents for receives, owes, and even state; long identities wrap rather than relying on color or truncation.
- No-game rounds say that no money games are configured while score results remain available.
- Player results use one fact source for Scores rendering. Existing game-specific calculations remain unchanged.
- Desktop and mobile team tables render the same effective `teamRows`, including identity, rank, Winner/Tied state, gross, net, net-to-par, money, and finality. Active and reopened rounds use live metrics; completed rounds prefer frozen team facts.
- Game-card wording was standardized only within the Scores summary. A broad canonical game-card framework and broad player/team fact-model refactor remain deferred.

## SSP Greeny and Prox validation

- Validation off resolves selected Greeny and Prox immediately, independent of Stat Tracking or putts.
- Validation on no longer forces Stat Tracking on. Without tracked putts, the host/local scorer can explicitly confirm or reject a selected Greeny.
- With tracked putts, 0–2 putts validates and 3 or more invalidates the Greeny with an explicit reason.
- Prox eligibility is derived only from validated Greenies: zero awards none, one auto-resolves, and two or more require a constrained selection.
- Putt edits rebuild eligibility deterministically and retain a Prox selection only while it remains eligible.
- Unresolved validation awards no Greeny or Prox points and prevents SSP from being treated as final or frozen.
- Manual validation is a synchronized SSP fact. Existing Shared Match host authority and fact-envelope reconciliation are preserved.
- Rendering is read-only and does not create or persist SSP facts or transactions.

## Memory recap guarantee

- Every saved Memory is included in recap input as a fact distinct from calculated events.
- The recap prompt explicitly requires material coverage of every Memory without invented detail.
- A deterministic post-processing guard appends omitted Memories under `Round Memories`, preserving descriptions and hole context.
- Empty Memory collections create no empty section. Historical views use saved match Memories without mutating RoundRecord.

## Responsive and accessibility improvements

- Added bounded Scores styles for outcome hierarchy, settlement identity wrapping, small-screen stacking, and intentional desktop width use.
- Lifecycle, Leader/Winner/Tied, Validated/Invalidated, and settlement states are present as text.
- The outcome uses a restrained polite live region.
- Manual SSP validation uses native keyboard-operable buttons with maintained touch sizing.
- Settlement amounts retain tabular alignment and payer/receiver identities remain visible.

## Tests added and updated

- Added `tests/v30.3.74-contracts.test.js` for outcome-first/frozen-safe Scores contracts, SSP validation-off/manual/putt-edit matrices, and deterministic Memory coverage.
- Updated SSP reliability tests for the manual-validation contract.
- Updated version, cache, icon, and release identity tests for v30.3.74.

## Explained simulation diagnostic

The single high-value review flag is the deterministic `blowout_match_play` fixture (included independently of the random seed; the v30.3.74 default seed is `dye-ledger-v30.3.74-default`). North is Alex/Casey and South is Blake/Drew. The fixture completes all 18 holes with deliberately one-sided scores and configures net Match Play ($5), net Nassau ($5 front/back/overall), Gross Skins ($2), Net Skins ($2), and three-player net 9-Point ($1 per point).

The exact diagnostic is: `A settlement row exceeds $100; confirm blowout/wager settings are intentional.` Alex finishes +$111, Blake -$151, Casey +$86, and Drew -$46; the minimal payment routes are Blake pays Alex $111, Blake pays Casey $40, and Drew pays Casey $46. The largest driver is 9-Point (Alex +$45, Blake -$105, Casey +$60), combined with valid Match Play, Nassau, and skin results. Every game and final settlement cross-foots to zero, all 18 nine-point holes allocate exactly nine points, save/reload is stable, and live/mirror results match exactly.

The flag is a preexisting deterministic review threshold in `scripts/simulation-engine.js` that marks any single payment over $100; both the fixture and threshold exist at the v30.3.73 base commit. It is an expected unusual outcome and a diagnostic false positive, not a v30.3.74 scoring or settlement defect. Scoring was not changed to suppress it. Future fixture-specific golden settlement snapshots would be useful but are not required for this release.

## Validation results

- Focused Scores/SSP/Memory/completed-team reconciliation: PASS — 65 tests, 0 failures.
- `npm test`: PASS — 212 tests, 0 failures.
- `npm run test:run`: PASS — 212 tests, 0 failures.
- `npm run simulate`: PASS — 75 rounds, 0 failures, 75 live/mirror matches, 0 differences; 58 warnings and 1 pre-existing suspicious outcome reported.
- `npm run simulate:live`: PASS — 75 rounds, 0 failures, 0 live/mirror differences; 58 warnings and 1 suspicious outcome.
- `npm run simulate:compare`: PASS — 75 rounds, 0 failures, 75 exact matches, 0 differences; 58 warnings and 1 suspicious outcome.
- `npm run simulate:100`: PASS — 125 rounds, 0 failures, 125 exact matches, 0 differences; 99 warnings and 1 suspicious outcome.
- `npm run release:sanity -- v30.3.74`: PASS — 8 checks passed, 1 expected dirty-working-tree warning, 0 failures.
- `npm run lint`: NOT AVAILABLE — `'eslint' is not recognized as an internal or external command, operable program or batch file.` `package.json` and `package-lock.json` still correctly declare ESLint; `npm ls eslint --depth=0` is empty and `node_modules/.bin/eslint.cmd` is absent. This is a local missing dependency and does not block v30.3.74.
- `npm run validate`: PASS — release metadata, assets, syntax, worker lifecycle, and required documentation are consistent.
- `node --check app.js`: PASS.
- `node --check service-worker.js`: PASS.
- `git diff --check`: PASS (line-ending conversion warnings only).

## Manual acceptance remaining

Physical-device and rendered-browser acceptance remains required at 320×720, 375×812, 390×844, 430×900, 768×900, 900×900, and 1280×720. Verify active/team/completed/reopened/no-game/missing/tie/zero/long-name/dense-Press Scores cases; the complete SSP validation matrix including two-device Shared Match; Memory recap and fallback behavior; keyboard/focus; PWA service-worker upgrade; and local data retention.

## Deferred

- Broad Match Summary or Round Story redesign
- New games, Press features, SSP game types, or analytics
- Navigation redesign or application-wide design-system work
- Historical comparison UI and broader AI prompting changes
- Semantic Press tree restructuring
- Broad canonical game-card framework and player/team rendering refactor
- Broad legacy CSS cleanup

Navigation, game engines, settlement architecture, RoundRecord architecture, and the Shared Match protocol were not redesigned. The frozen record received only additive team presentation facts. Stable transaction IDs, Press IDs, SSP facts, and exactly-once settlement remain protected.
