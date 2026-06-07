# The Dye Ledger v27.47 Build Notes

Focused correction to the v27.46 Gross Game Detail feature.

## Changed
- Player Gross Summary cards now show each player's aggregate result by selected game only.
- Games not selected for the match are omitted from Gross Game Detail.
- Game-by-Game Payout Detail remains grouped by selected game only.
- 9-Point Game detail now preserves raw pairwise obligations instead of optimizing/netting the 9-Point transactions inside the game detail.
- Final Net Settlement remains the only combined, optimized cash-payment section.

## Unchanged
- Game scoring logic and settlement math.
- Supabase Course Library sync.
- AI scorecard import and multi-image import.
- Offline-first/local-first behavior.
- Saved-match localStorage compatibility.
- scorecard-import Edge Function.
