# The Dye Ledger v31.0.01 Build Notes

## Release purpose

v31.0.01 establishes a durable Shared Match score-delivery foundation. A score is saved locally first, retained in a versioned device outbox, submitted through a narrow idempotent server boundary, and removed only after explicit acknowledgement.

## Changes

- Adds changed-row score operations with permanent operation IDs and client revisions.
- Adds atomic server acknowledgement receipts and monotonic Match revisions.
- Adds private Realtime score-change notifications with bounded polling fallback.
- Adds an independent active-device heartbeat so presence is not inferred from score synchronization.
- Distinguishes saved-on-device, sending, confirmed, offline, and attention-required states.
- Preserves the pre-migration direct-write pathway as a temporary compatibility fallback.
- Adds deterministic duplication, reordering, interruption, retry, and 1,000-operation convergence coverage.

## Compatibility and persistence

- Existing local rounds, players, scores, memories, preferences, templates, and PWA data remain unchanged.
- No historical local round is uploaded, claimed, rewritten, merged, deduplicated, or deleted.
- Scoring, handicap, game, settlement, SSP, Press, recap, and reporting calculations are unchanged.
- The database migration is additive and is not applied by the release build.

## Deployment gate

The migration must be validated twice on an explicitly configured disposable environment. Production application requires a separate Product Owner approval, backup, preflight inventory, and rollback readiness.
