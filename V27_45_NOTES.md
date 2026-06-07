# The Dye Ledger v27.45 Build Notes

Focused follow-up corrections from v27.44.

## Changes

- Matched the Penalty Strokes input width and numeric styling to the Putts input in the scoring/stat entry UI.
- Updated Player Leaderboard Net and Net to Par display calculations to use each player's own Course Handicap stroke allocation hole-by-hole.
- Preserved game/match stroke allocation, skins, 9-point scoring, settlements, saved scores, Supabase Course Library behavior, AI scorecard import, and localStorage backward compatibility.

## Notes

- Postable Score remains informational and continues to use the net double bogey cap methodology.
- Penalty Strokes remain a tracked stat and do not automatically alter gross score.
