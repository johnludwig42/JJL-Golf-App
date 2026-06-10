# The Dye Ledger

Current version: **v28.8**

## What changed in v28.8

- Refined Match Summary report flow by moving Round Recap above Games Summary and Player Leaderboard above Final Net Settlement.
- Increased Match Summary Round Recap body text size.
- Expanded AI Round Recap generation to target 10–12 sentences with richer gross scoring, gaming, momentum, and player-highlight detail.

## v28.4
- Added optional Generate Round Recap workflow.
- Added new round-recap Supabase Edge Function for CBS Fantasy-style round summaries.
- Round Recaps are saved locally with the match and included in the Match Summary report when generated.
- No scoring, settlement, Classic Scorecard, Supabase schema, or cloud sync changes.

## v28.3

- Gross Game Detail starts on a fresh page in Match Summary PDF output.
- Match Summary includes a 9-Point Scorecard after the Classic Scorecard when selected.
- iPhone 9-Point Scorecard scrolling keeps player names fixed and scrolls holes from H1.
