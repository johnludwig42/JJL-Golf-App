# The Dye Ledger v27.48 Build Notes

Focused UX correction release from v27.47.

## Changes

1. **9-Point transaction detail label**
   - Renamed the transaction-level label in Gross Game Detail from Net terminology to **9-Point Gross Result**.
   - No 9-Point scoring, payout, pairwise payment, Player Gross Summary, or Final Net Settlement math was changed.

2. **Team Leaderboard visibility**
   - Hides the Team Leaderboard when every team contains only one player.
   - Keeps the Player Leaderboard visible and unchanged.
   - Shows the Team Leaderboard normally when any team contains more than one player.

## Preserved

- Existing game scoring and settlement calculations.
- Supabase Course Library behavior.
- AI scorecard import and Edge Function files.
- Existing localStorage data structures and saved match compatibility.

## Edge Function

`supabase/functions/scorecard-import/index.ts` was not changed.
