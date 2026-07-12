# Build Notes v30.3.63 — Trip Ledger Architecture Prep

## Release theme

A newly finalized round can become a durable accounting record for a future Trip Ledger. Historical financial results use frozen production settlement transactions rather than being recomputed from scores by newer game logic.

## Architecture changes

- Added persisted `match.roundRecordSnapshot` with freeze/settlement timestamps and source-version metadata.
- Confirm Finish freezes only fully completed rounds or early-ended rounds whose games are all mathematically final.
- Match Summary uses a frozen record when present; legacy rounds remain safely derived on demand.
- Reopening explicitly supersedes the prior snapshot into `roundRecordSnapshotHistory`; corrected completion may create a new snapshot.
- Shared Match creation and publication are host-only. Joined devices cannot replace frozen records.
- Added nullable `tripId`, `eventId`, `ownerUserId`, `createdBy`, `deviceId`, and `hostDeviceId` hooks.
- Added optional local schema-v1 `playerRegistry` and `savedRosters` containers without new UI, login, or cloud dependency.
- Legacy match participants lacking IDs receive a stable match-scoped ID; same-name players remain distinct.

## Persisted schema and compatibility

New state fields are `playerRegistry` and `savedRosters`. New match fields are `roundRecordSnapshot`, `roundRecordSnapshotHistory`, `tripId`, `eventId`, and nullable ownership/device hooks. New RoundRecord metadata mirrors grouping and ownership references. Changes are additive; no historical bulk migration or Supabase schema migration occurs. Legacy matches without a snapshot continue to load, score, settle, reopen, save, and render using on-demand RoundRecord derivation.

## Frozen transactions

Frozen payer/payee transactions come directly from the existing production payout context and optimal settlement rows. Transaction ordering and IDs are deterministic, values must be finite and positive, player references must be stable IDs, and reconciliation remains unchanged. Game and settlement math were not intentionally changed.

## Files changed

- `app.js`
- `index.html`
- `manifest.json`
- `service-worker.js`
- `package.json`
- `package-lock.json`
- `tests/trip-ledger-architecture.test.js`
- `docs/TRIP_LEDGER_ARCHITECTURE.md`
- `BUILD_NOTES_v30.3.63.md`

## Tests and simulations

Focused tests cover frozen persistence, report non-mutation, changed-derivation historical stability, legacy defaults and IDs, same-name registry entries, roster ID normalization, trip/event persistence, transaction ID references, and joined-device authority.

- Syntax checks: passed for `app.js` and `service-worker.js`.
- Release sanity: 8 passed, 1 expected dirty-tree warning, 0 failed (direct and npm script).
- Full automated suite: 81 passed, 0 failed.
- Course: 16 passed; SSP: 34 passed; SSP Shared Match: 5 passed; Shared Match: 8 passed; live engine: 4 passed.
- Simulations: standard, live, and compare each completed 60 rounds with 0 failures and 60 exact live/mirror matches; the 100-random run completed 110 total rounds with 0 failures and 110 exact matches.
- Simulation warnings were expected provisional/clinched-round diagnostics. The sole suspicious fixture was the pre-existing `blowout_match_play` threshold signal.
- `npm run lint` could not start because the local `eslint` executable is not installed in this workspace; no lint assertions ran.

## Known limitations

- Architecture preparation only: no Trip Ledger UI or aggregator.
- No roster/player-registry management UI, login, authentication, permissions, invitations, or cloud ownership enforcement.
- No automatic freezing of legacy settled rounds.
- No explicit transaction currency code or multi-game allocation beyond the existing combined-settlement representation.
- Two-device Shared Match snapshot transport still requires manual acceptance testing.

Login was not implemented. Game and settlement math were not intentionally changed. Codex did not commit or push.
