# The Dye Ledger v31.0.40

## Foundational Games — Sixes (6-6-6)

- Adds selectable four-player Sixes with a saved player order and three rotating six-hole partnerships.
- Scores every hole once as Best Ball match play on a saved Gross or Net basis, shared by both scoring modes.
- Adds Player Points as the default: both winning partners earn one point, and final individual totals settle head-to-head across all six player pairs at dollars per point.
- Retains Segment Matches as the alternate mode: each decided six-hole segment settles independently at dollars per segment.
- Allocates Net game handicaps once for the full round at the saved allowance, always relative to the lowest Game Handicap among the four selected golfers.
- Treats partial four-player holes as unknown and excludes them from segment results.
- Keeps point totals informational in Segment Matches and segment records informational in Player Points so the displayed money basis is always explicit.
- Shows Segment Matches in the Ledger Entry as a per-player settlement matrix by segment, cross-footed to each golfer's final Sixes net result.
- Adds Sixes status to Play, Quick Scoreboard, Scores, player detail, payout detail, Story facts, Shared Match round-trip, and Ledger Entry.
- Locks the saved player order once scoring begins.
- Requires an 18-hole round. Player Points cannot clinch before the eighteenth hole; Segment Matches cannot complete until all three segments are decided.
- Adds dedicated calculation, persistence, simulation, Shared Match, and print-layout coverage.

## Compatibility

- No database migration.
- No new top-level Round fields or storage keys.
- Existing rounds, games, templates, Classic Mode, Player Mode, and Shared Match score facts remain compatible.
- Aggregate team scoring, total-strokes segment results, a fourth overall wager, and 9-hole 3-3-3 remain deferred.
