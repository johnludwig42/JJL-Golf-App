# The Dye Ledger v27.21 Build Notes

## Scope
- Stat Tracking summary limited to fully completed holes only.
- Added automatic score distribution by player using gross score versus par.
- Hardened Create New Match reset flow to avoid intermittent modal/reset hangs.

## Changes
- Stat totals now use lastFullyCompletedHole and ignore partial/future holes.
- If no holes are fully completed, Stat Tracking shows “No completed holes yet.”
- Added score distribution table: Player, HIO, Albatross, Eagle, Birdie, Par, Bogey, Double, Other.
- Hole-in-one is counted separately and not double-counted as eagle/albatross.
- Create New Match reset path remains a single clean reset helper and was reviewed for modal close/reset reliability.

## QA Summary
- JavaScript syntax check passed.
- Verified stat summary logic only iterates through completed holes.
- Verified score distribution uses gross score against hole par and completed holes only.
- Verified version markers updated to v27.21 and only v27.21 build notes included.
