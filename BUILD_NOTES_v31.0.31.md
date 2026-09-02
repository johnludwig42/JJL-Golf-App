# v31.0.31 — Post-Round State and Setup Correctness

## Summary

- Persists the completed-round review pointer so same-tab Ledger Entry navigation returns to the same round.
- Routes an unresolvable Review Story action visibly to Saved Rounds instead of silently doing nothing.
- Displays **Clinched Early** for frozen rounds that ended before all configured holes were played.
- Keeps Featured Competition and the displayed/cloud game aligned across setup, normalization, templates, next-round drafts, fallbacks, and Shared Match hydration.
- Preserves host authority for the Featured Competition on joined Shared Match devices.
- Verifies the existing shared select-rebuild helper preserves Course and calculator selections across rerenders.

## Compatibility

The persisted review pointer is additive. Older saved states load with a null pointer. No localStorage migration, storage-key change, Supabase migration, scoring change, or RoundRecord mutation is required.

## Verification

- Focused post-round lifecycle, Ledger status, Featured Competition invariant, Shared Match precedence, and select-preservation tests.
- Complete application tests, lint, release validation, simulations, and Ledger Entry layout acceptance.
