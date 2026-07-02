# The Dye Ledger v30.3.31 – Singles Match Play Momentum Result Fix

## Release Theme
Singles Match Play Momentum should match Singles Match Play Game Summary.

## Changes
- Fixed Singles Match Play handling in `computeMomentumOutcome()` so it returns only expected momentum outcome tokens: `team1`, `team2`, `tie`, or `pending`.
- Consolidated duplicate/conflicting Singles Match Play momentum branches.
- Fixed Singles Match Play momentum metadata so `describeMomentumMeta()` returns a clean display string.
- Preserved actual play order for Singles Match Play Momentum.
- Preserved traditional 1–18 ordering for Nassau Momentum and Classic Scorecard.

## Validation Notes
- Gross and Net Singles Match Play Momentum should reconcile to Games Summary.
- Actual play order remains stable after score edits.
- Nassau Momentum remains unchanged.
- No Supabase schema changes.
- No PWA/service-worker behavior changes other than version/cache naming.
