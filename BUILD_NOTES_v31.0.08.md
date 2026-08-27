# v31.0.08 — Player Mode Accordion Entry

## Outcome

Player Mode now uses one collapsible score-and-stat card per golfer. The duplicate fast score-entry surface has been removed from Player Mode, while Classic Mode and all shared scoring, persistence, competition, sync, and reporting behavior remain unchanged.

## Player Mode

- Golfers remain grouped by team and display match-stroke dots beside their names.
- Collapsed cards show the golfer's current gross score and score-to-par result, or clearly indicate whether a score or statistics are still needed.
- Selecting a golfer expands that golfer's single authoritative entry surface.
- The expanded card contains gross score and the applicable None, Casual, Enhanced, or Grind stat controls.
- Selecting a different golfer closes the prior card; selecting the open golfer again collapses all cards.
- Score-only golfers retain a compact gross-score entry card without unnecessary stat controls.
- Existing hole navigation, featured competition status, Saved state, overflow actions, and persistent Save & Next Hole control remain available.

## Isolation and compatibility

- Classic Mode markup and behavior are unchanged.
- Both Play modes continue to write through the same score and statistical data model.
- No score, stat, calculation, report, cloud-sync, or Shared Match schema changed.
- Existing rounds and player preferences remain compatible.

## Verification

- Complete application suite: 377 tests passed.
- Simulation Lab: 75 rounds, 0 failures, and 75 exact live-versus-mirror results.
- Mobile interaction review covered expanding, switching, and collapsing player cards and entering scores/statistics.

## Deployment

No database migration is required.
