# The Dye Ledger v27.44 Build Notes

## Focus
This release adds two focused scoring/stat features on top of v27.43 while preserving existing Supabase Course Library behavior, AI scorecard import, multi-image import, offline-first/local-first behavior, and backward compatibility with existing localStorage data.

## Changes

### 1. Player Leaderboard Postable Total
- Added a Postable total for each player on the Player Leaderboard.
- Postable total uses the net double bogey posting limit by hole: par + 2 + handicap strokes received on that hole.
- The calculation uses each player's course handicap and the hole stroke index where available.
- Postable total is informational only and does not change gross scoring, net scoring, game results, skins, match settlements, or saved round scores.
- Missing or incomplete hole data is handled safely.

### 2. Penalty Strokes Stat Tracking
- Added Penalty strokes input immediately after Putts in the stat tracking card.
- Penalty strokes are numeric and default to 0 when missing.
- Penalty strokes persist with player hole-level stats in localStorage.
- Existing rounds without penalty stroke data continue to load normally.
- Stat summaries now include total penalty strokes in the same style as putts.

## Compatibility Notes
- No authentication changes.
- No saved-match cloud sync changes.
- No cloud course deletion changes.
- No destructive localStorage migration.
- Supabase Course Library sync remains additive/restorative.
