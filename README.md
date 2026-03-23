# The Dye Ledger — Release 2 (stability + scoring foundation)

This build fixes the Release 1 match-creation issues and moves deeper into Release 2.

## Fixed
- `Create Match` now initializes and saves correctly.
- gambling game selection now works correctly
- saved course/tee selectors are preserved more reliably while editing
- new tees inherit the course stroke-index template correctly
- tee save now validates that all 18 stroke indexes are entered and total **171**

## Included in this build
- core selectable game setup from Release 1
- selected-game-aware leaderboard summaries
- better preservation of form state during rerenders
- app storage key bumped with fallback to prior local versions

## Notes
- Greenies is still setup-ready; live per-hole greenie winner entry is the next logical enhancement.
- Team Stroke Play scoring mode selection is stored, and deeper scoring/output work continues in the next iteration.
