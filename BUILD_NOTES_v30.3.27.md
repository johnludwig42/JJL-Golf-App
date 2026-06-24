# The Dye Ledger v30.3.27 Build Notes

## Release Theme
Incomplete rounds should feel intelligent, truthful, and golf-aware.

## Changes
- Added mathematical clinch detection helpers for hole-based match results, allowing incomplete rounds to show final results when the lead is mathematically insurmountable.
- Added round-end reason capture for early finishes, including darkness, weather, injury, concession, group ended early, and other.
- Persisted round-end metadata, completion state, completed-hole count, and remaining-hole numbers for future resume-round support.
- Updated incomplete-round Match Summary copy to include the round-end reason and whether selected games are final or provisional.
- Added partial-nine leader handling so incomplete front/back nines can still show useful leaders instead of only “Not determined.”
- Added settlement intelligence to distinguish provisional settlements from mathematically final settlements despite unplayed holes.
- Added a canonical `isHoleComplete` helper and updated completion-state logic around the rule that a hole is complete only when every active player has a valid gross score.
- Expanded AI Round Recap payload context so AI can distinguish incomplete, clinched, provisional, and round-end-reason scenarios.
- Preserved completed-round behavior and avoided fabricated or projected scores.

## Versioning
- Updated app version to v30.3.27.
- Updated cache name to `the-dye-ledger-v30.3.27`.
