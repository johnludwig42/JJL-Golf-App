# Build Notes v30.3.65 — Press Engine Design and Nassau Extension Prep

## Release theme

Define presses completely before enabling them.

## Architecture and schema

- Added dormant schema-v1 `match.pressConfig` and `match.presses` structures.
- Defaults are disabled, manual, `OPEN_SEGMENT_ONLY`, maximum three, inherited parent wager, host-only authority, and null automatic threshold.
- Press records have stable round, parent Nassau, segment, range, identity, lifecycle, device, and audit fields.
- No Match Setup or Play controls imply that production wagering is available.

## Availability and lifecycle

- `OPEN_SEGMENT_ONLY` rejects a mathematically decided parent.
- `FUTURE_HOLES_REMAIN` permits a press after parent clinch when a future segment hole remains.
- Pure eligibility returns stable reason codes, next starting hole, remaining holes, count/limit, authority, parent identity, wager, and basis.
- Lifecycle preparation covers pending, active, final, halved, incomplete, voided, and superseded.
- Both-basis Nassau requires an explicit gross or net parent lane.

## Settlement and authority preparation

- A dormant settlement-shape helper mirrors the existing per-person Nassau convention, preserves press/parent IDs, creates deterministic zero-sum payer/payee rows, and is not wired into production totals.
- Shared Match metadata can transport dormant configuration and normalized host records. Only the host is eligible to author authoritative changes.
- Production Press UI, payout integration, automatic triggering, requests, void UI, and notifications remain deferred.

## RoundRecord and compatibility safeguards

- Frozen RoundRecord creation, transactions, report viewing, reopening, and supersession behavior are unchanged.
- Legacy matches normalize to presses disabled and no records.
- No historical presses, destructive migration, login, cloud dependency, or Supabase migration was added.

## Files changed

- `app.js`
- `index.html`
- `manifest.json`
- `service-worker.js`
- `package.json`
- `package-lock.json`
- `tests/press-engine-design.test.js`
- `docs/PRESS_ENGINE_ARCHITECTURE.md`
- `BUILD_NOTES_v30.3.65.md`

## Tests

Focused deterministic coverage includes defaults/invalid config, save/reload, stable IDs, both availability policies, open/clinched parents, future holes, final eligible hole, segment limits, duplicates, zero wager, host/join authority, settled/reopened/early-ended states, shortened rounds, both-basis parents, every lifecycle state, inherited settlement shape, reconciliation, source non-mutation, production payout isolation, legacy safety, and frozen RoundRecord non-mutation.

## Validation results

- Syntax checks passed for `app.js` and `service-worker.js`.
- Release sanity passed 8 checks with the expected dirty-tree warning and 0 failures, directly and through npm.
- Focused Press Engine design suite: 6 passed, 0 failed.
- Full suite and `test:run`: 92 passed, 0 failed.
- SSP/Nassau-adjacent suite: 34 passed; Shared Match: 8 passed; live engine: 4 passed.
- Combined press/mobile/report/RoundRecord group: 22 passed, 0 failed.
- Standard, live, and compare simulations each completed 60 rounds with 0 failures and 60 exact live/mirror matches. The 100-random run completed 110 total rounds with 0 failures and 110 exact matches.
- Expected provisional/clinched warnings remained; the sole suspicious result was the pre-existing `blowout_match_play` threshold diagnostic.
- `npm run lint` could not start because the local `eslint` executable is unavailable; no lint assertions ran.

## Known limitations and deferred features

No production press button, setup controls, payout contribution, automatic press, request/approval workflow, edit/void UI, notifications, Quick Scoreboard/Scores press UI, custom/double/escalating values, recursive press, or RoundRecord press transaction integration is enabled.

Production press wagering was not enabled. Game, Nassau, handicap, payout, settlement, and frozen RoundRecord math were not intentionally changed. Codex did not commit or push.
