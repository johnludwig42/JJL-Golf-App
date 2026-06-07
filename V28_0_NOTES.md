# The Dye Ledger v28.0 Build Notes

## Match Summary Unification

- Established a canonical Match Summary report order across iPhone and desktop outputs.
- Standardized Games Summary, Final Net Settlement, Player Leaderboard, Team Leaderboard, Score Distribution, Stat Tracking Summary, Gross Game Detail, and individual game detail ordering.
- Kept platform differences limited to responsive layout decisions.
- Ensured Team column hiding applies to the Match Summary Player Leaderboard when all teams are one-player teams.
- Ensured Team Leaderboard remains conditional and only appears for true multi-player teams.

## Stat Tracking Summary

- Added Total Putts alongside Avg Putts in the exported Stat Tracking Summary.
- Preserved penalty strokes, up & downs, sandies, fairways, GIR, and average putts.

## Gross Game Detail

- Preserved Player Gross Summary and Game-by-Game Payout Detail.
- Match Summary reports now render Gross Game Detail directly, while the in-app section remains collapsed by default.
- Preserved the 9-Point Gross Result label for transaction-level audit detail.

## Classic Scorecard

- No intentional changes were made to the Classic Scorecard calculations, layout, formatting, sizing, symbols, spacing, or rendering logic.

## Scope

- No scoring logic changes.
- No settlement calculation changes.
- No localStorage format changes.
- No Supabase schema changes.
- No authentication or saved-match cloud sync changes.
