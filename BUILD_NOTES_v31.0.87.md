# v31.0.87 — Storage Notice Clarity

WP-STORE-01 updates the local storage notice. Large saved-data estimates show main app data, the recovery backup and other local data separately. Pending score delivery and preserved scores awaiting host review have separate text. Review actions remain available for matching rounds. The size notice no longer links to saved rounds.

## Scope and preservation

The notice uses the existing UTF-16 estimate and storage scan. Both thresholds and the visibility rule are unchanged. Sizes are estimates of stored data. iPhone localStorage headroom remains unknown. Recovery, backup and quota behavior, storage keys, outbox handling, scoring, settlement and historical records are unchanged. The existing measurement-failure and storage-full messages are preserved.

## Verification

I1 passed 34 targeted tests with zero skips. Chromium before/after measurements each reached the notice refresh and completed one key pass. Rendering, saving and rewriting the outbox each used one fewer read with the same write counts and keys. The first legacy recovery browser invocation failed in the Windows ESM loader. The one retry with a file URL passed. I2 adds coverage for the displayed figures when a backup exists.

Release gate results are recorded in the I2 review handoff. Real-device observation is pending.
