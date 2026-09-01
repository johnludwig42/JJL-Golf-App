# The Dye Ledger v31.0.23

## Scope

Persistent multi-match Shared Score outbox delivery. This release does not implement the planned round-lifecycle pointer changes.

## Changes

- Discovers pending score operations across every locally saved Shared Match rather than only the active round.
- Continues score delivery for completed and paused rounds, including when `activeMatchId` is null.
- Separates pending score submission from full Match metadata synchronization.
- Processes a bounded two-match batch sequentially and coalesces repeated drain requests into a deferred continuation.
- Runs discovery at startup, periodic refresh, reconnect, and foreground events.
- Preserves per-match partitioning and explicit server-acknowledgement removal.
- Classifies authorization, membership, assignment, and policy failures as permanent so later retry tuning does not loop on them.

## Compatibility

No database migration, localStorage key change, outbox schema change, scoring change, settlement change, or reporting change.

## Release gate

Automated coverage proves that a completed Shared Match with pending operations drains successfully while `activeMatchId` is null. Physical two-device testing remains required before the subsequent round-lifecycle release begins.

## Verification

- Focused Shared Match suite: 20 passed.
- Complete application suite: 620 passed, 0 failed.
- Release validation: passed.
- Lint: 0 errors and 178 pre-existing warnings.
- Simulation comparison: 75/75 exact live-versus-mirror matches, 0 failures.

The physical host/joined-device offline, reconnect, background, reload, and completion checklist remains unresolved and must be completed before the lifecycle release begins.
