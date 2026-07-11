# Build Notes v30.3.58 — Play Tab UX Scrub and Featured Match Polish

## Release theme

Make live scoring clearer, more accurate, and more golf-native without changing SSP values, Take/Keep, Bridge/Re-Bridge, Umbee, settlement, momentum, or other game engines.

## Shipped

- Selecting Sandy immediately selects Sneaky. Removing Sandy leaves Sneaky selected; selecting Sneaky alone does not select Sandy.
- SSP input normalization defensively treats legacy Sandy-only data as both Sandy and Sneaky. Shared-fact comparison applies the same implication so equivalent normalized facts do not create false conflicts.
- The Play header now follows the configured Featured Competition (or explicit match-status selection) instead of defaulting to Nassau. SSP uses truthful `Live SSP` or `SSP Match` wording and configured team names.
- SSP honors now appears on a compact second line only when SSP is active and the ledger has a safe played-hole sequence.
- Small-iPhone header spacing, wrapping, and status sizing were tightened without changing scoring controls.

## Validation

Passed app/service-worker syntax, both release sanity commands, `git diff --check`, focused SSP/Shared Match suites, simulation/live-engine suites, `npm test`, and `npm run test:run`. All requested simulation modes completed with zero invariant failures. The v30.3.58 seed exposed one pre-existing live-vs-mirrored final-settlement-row difference (`random_035`); settlement and simulation-mirror changes are outside this Play UX release. The generated latest summary was inspected and reverted.

## Known limitations

- Some games expose only a compact featured-status helper rather than a rich narrative.
- The v30.3.58 simulation seed has one live-vs-mirror settlement-row difference (`random_035`) with zero invariant failures; payout mirror alignment remains separate work.
- SSP honors is hidden until the ledger has enough played-hole data to derive it safely.
- Field-level SSP conflict UI, randomized two-device SSP simulation, broader tab-by-tab UX work, Skins/Net Skins cleanup, Courses audit, and Player Preferences remain deferred.
