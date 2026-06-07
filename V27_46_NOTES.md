# The Dye Ledger v27.46 Build Notes

Focused UX/scoring transparency enhancement from v27.45.

## Added
- Added a collapsed-by-default **Show Gross Game Detail** control immediately below the final settlement area.
- Added mobile-friendly player gross summary cards showing each player's result by game and gross total.
- Added game-by-game gross payout detail using vertical payment lines instead of wide tables.
- Relabeled the primary settlement section as **Final Net Settlement — Efficient Cash Payments**.

## Preserved
- Final optimized settlement logic remains the authoritative payment answer.
- Existing game scoring, skins, 9-point, Nassau, side-match, and settlement math were not changed.
- Supabase Course Library, AI scorecard import, localStorage compatibility, Postable Score, Penalty Strokes, and Player Leaderboard behavior were preserved.
- No authentication, saved-match cloud sync, cloud deletion, or unrelated refactoring added.

## Notes
- Gross Game Detail is informational/audit-only and is rendered from existing live payout calculations.
- Layout uses stacked cards and vertical lists for iPhone portrait usability.
