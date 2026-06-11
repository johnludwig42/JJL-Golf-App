# The Dye Ledger v28.11 Build Notes

Focused enhancement: player-specific Stat Tracking participation.

## Included
- Added **Enable Stat Tracking For** player selection in Match Setup.
- Added Select All / Clear All controls for stat-tracking participants.
- Stat inputs now appear only for players selected for stat tracking.
- Stat Tracking Summary now includes only selected stat-tracking players.
- Round Recap stat/coaching data now respects stat-tracking participation.
- Existing matches remain backward compatible: older matches default to prior all-player stat tracking behavior when stat tracking is enabled.

## Preserved
- No scoring calculation changes.
- No game, settlement, leaderboard, Classic Scorecard, Momentum Chart, Supabase schema, or course-sync changes.
- Existing stat values are preserved if a player is deselected and later reselected.
