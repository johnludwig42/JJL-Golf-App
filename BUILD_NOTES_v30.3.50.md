# BUILD_NOTES_v30.3.50.md

Build v30.3.50 - Shared Match Persistence & Reconciliation

## Release Theme
Every Device. One Truth.

## Problem Addressed
A Shared Match could appear synchronized after a successful network request while one device still had stale or incomplete local score state. That could produce materially different Match Summaries from the same round.

This release makes Shared Match score parity explicit. A network save is no longer treated as proof that local and shared scored-hole ledgers match.

## Files Changed
- app.js
- index.html
- manifest.json
- package.json
- package-lock.json
- service-worker.js
- scripts/simulation-engine.js
- scripts/shared-match-ledger.js
- tests/shared-match-ledger.test.js
- ENGINEERING_DECISIONS.md
- TECHNICAL_DEBT.md
- BUILD_NOTES_v30.3.50.md

## Scored-Hole Ledger Behavior
- Added centralized scored-hole ledger extraction for local match state.
- Added remote/shared scored-hole ledger extraction for Supabase score entries.
- Ledger entries compare player, hole, gross score, scored state, and safe stat fields when present.
- Ledger summaries include per-player scored-hole counts and local/remote checksums.

## Reconciliation Behavior
- Shared Match score pulls now compare local and remote scored-hole ledgers.
- Before Match Summary generation, shared matches attempt to pull latest shared score entries, merge valid missing remote scores, and compare ledgers.
- Non-shared matches keep the existing report behavior.

## Joined-Device Score Preservation Behavior
- Remote/shared scores are adopted locally when the local score is missing.
- Matching local and remote scores are accepted.
- Local scores are preserved when remote/shared entries are absent.
- Conflicting non-empty player-hole values are flagged instead of silently overwritten.

## Conflict Detection Behavior
- Conflicts are detected at player-hole field level.
- Captured fields include player, hole, field name, local value, remote/shared value, and available source device/participant metadata.
- v30.3.50 detects and warns; it does not add a complex conflict-resolution UI.

## Sync Status Behavior
- Shared Match status language now distinguishes network success from score parity.
- Status concepts include pushed to shared match, pulled/reconciled scores, score parity confirmed, sync warning, conflict detected, and offline/retry states.

## Diagnostics Added
- Shared Assignment Diagnostics now include local scored holes by player, remote/shared scored holes by player, last parity check time, parity status, missing local entries, missing remote entries, conflicts detected, and checksum data.
- Ledger helper functions are exposed on `window` for Product Owner/debug-console inspection.

## Report Warning Behavior
- Match Summary generation for Shared Matches now attempts final reconciliation before rendering.
- Confirmed summaries show Shared Match reconciliation confirmed.
- If parity is not confirmed, the generated summary includes a clear provisional reconciliation warning.

## Tests Added
- Added `scripts/shared-match-ledger.js`.
- Added `tests/shared-match-ledger.test.js`.
- Added `npm run test:shared-match`.
- Added shared-match ledger tests to `npm test` and `npm run test:run`.
- Tests cover identical ledgers, missing local entries, missing remote entries, conflicts, stale-host merge behavior, joined-device score preservation, old shared matches without new metadata, and more than two devices.

## Passed Validation Commands
- `node --check app.js` - passed.
- `node --check service-worker.js` - passed.
- `node --check scripts/release-sanity-check.js` - passed.
- `node --check scripts/shared-match-ledger.js` - passed.
- `node --check scripts/simulation-engine.js` - passed.
- `node scripts/release-sanity-check.js v30.3.50` - passed with 7 PASS, 1 WARN, 0 FAIL. The WARN is expected because the release working tree has uncommitted changes during Codex work.
- `npm run release:sanity -- v30.3.50` - passed with 7 PASS, 1 WARN, 0 FAIL. The WARN is expected because the release working tree has uncommitted changes during Codex work.
- `git diff --check` - passed with line-ending normalization warnings only.
- `npm run simulate` - passed. 60 rounds, 0 failures, 40 warnings, 1 suspicious outcome, 0 live-vs-mirror differences.
- `npm run simulate:100` - passed after report-write escalation. 110 rounds, 0 failures, 73 warnings, 2 suspicious outcomes, 1 live-vs-mirror difference (`random_087: Final settlement rows differed`).
- `npm run simulate:live` - passed after report-write escalation. 60 rounds, 0 failures, 40 warnings, 1 suspicious outcome, 0 live-vs-mirror differences.
- `npm run simulate:compare` - passed after report-write escalation. 60 rounds, 0 failures, 40 warnings, 1 suspicious outcome, 0 live-vs-mirror differences.
- `npm run test:simulations` - passed. 3 tests passed.
- `npm run test:live-engine` - passed. 4 tests passed.
- `npm run test:shared-match` - passed. 8 tests passed.
- `npm test` - passed. 15 tests passed.
- `npm run test:run` - passed. 15 tests passed through the npm test alias.

## Unavailable Validation Commands
- `npm run lint` - unavailable because `eslint` is not installed or available on PATH in this working copy.
- `npm run validate` - unavailable because `scripts/validate-release.js` does not exist in this working copy.
- `npm run test:money` - unavailable because `tests/money-math.test.js` does not exist in this working copy.

## Known Limitations
- Full two-device browser automation was not added; the Chatham Hills pattern is covered at ledger/reconciliation unit level.
- Supabase schema was not changed.
- Conflict detection is warning-only; manual review is still required when conflicts are found.
- `npm run simulate:100` reported one live-vs-mirror settlement-row difference in `random_087`. Targeted inspection showed identical final player totals:
  - p1: 6
  - p2: -7
  - p3: -7
  - p4: 8

  The difference appears to be equivalent settlement payment-path ordering/normalization rather than a scoring-total or game-amount difference. This is not treated as a v30.3.50 Shared Match blocker, but should be followed up with deterministic settlement-row normalization in a future release.
- `reports/simulation/latest-summary.md` was regenerated during validation and reverted so generated report churn is not included in the release commit.

## Recommended Next Release
Recommended next release: v30.3.51 - Play Tab Command Center Polish.
