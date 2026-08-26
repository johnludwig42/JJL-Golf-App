# Player Mode Contract — v31.0.07

Player Mode is an input adapter, not a second scoring system. It may select a golfer, render tap targets, collect explicit hole facts, and request a save. It must not duplicate scoring, handicap, competition, settlement, synchronization, or report calculations.

## Tracking levels

- **None:** gross scores only.
- **Casual:** putts, penalties, tee-shot result, and calculated GIR.
- **Enhanced:** Casual plus five-way green result and recovery outcomes.
- **Grind:** Enhanced plus bunker involvement and future shot-context extensions. It is restricted to devices scoring no more than two golfers.

## Definitions

- Putts are counted by lie, not club. A fringe putter stroke is not a putt.
- A conceded putt counts as a stroke and a putt.
- GIR requires the ball to be on the putting surface with at least two strokes remaining relative to par.
- GIR is derived only when gross score, par, and user-confirmed putts are known. Unknown inputs remain unknown.
- GIR overrides are reserved for edge cases and preserve correction provenance.

## Compatibility

All new hole-stat fields are additive. Legacy boolean fairway and green fields remain populated for existing reports and calculations.
