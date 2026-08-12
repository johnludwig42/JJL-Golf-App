# The Dye Ledger v31.0.04 — End-of-Round Experience

## Scope

- Clearly separates **Complete Round** from **End Round Early**.
- Adds a mobile-first final review of progress, missing scores, enabled-stat coverage, unresolved game facts, result finality, and settlement status.
- Makes Shared Match finalization host-only while preserving parity-gated completion and joined-device local scoring.
- Adds a backward-compatible finalization receipt alongside the existing recovery marker and frozen RoundRecord snapshot.
- Preserves existing completion, scoring, game, settlement, reporting, local persistence, and Shared Match synchronization engines.

## Persistence and compatibility

- `finalizationReceipt` is additive and optional; legacy matches remain readable.
- Unknown stored fields are preserved by the existing normalization and cloning paths.
- No local record is deleted, migrated, claimed, merged, or rewritten.
- No production Supabase schema, policy, function, or data is changed.

## Manual acceptance still required

- iPhone normal completion, early ending, missing-score routing, enabled-stat warning, and post-round actions.
- Host and joined-device authority states plus offline/reconnect recovery.
- Match Summary and Ledger Entry generation from both final and provisional rounds.
