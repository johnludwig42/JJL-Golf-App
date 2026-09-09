# The Dye Ledger v31.0.42

## Foundational Games: Wolf

- Adds Wolf as a selectable local-only game for exactly four golfers.
- Saves the four-player rotation order and locks it when scoring begins.
- Supports partner, Lone Wolf, and optional Blind Wolf declarations with a configurable point schedule.
- Scores each hole from one shared gross/net comparison and settles final individual point totals head-to-head at dollars per point.
- Supports continuing the rotation, assigning the last two Wolf positions to the low-point players, or playing no Wolf on those positions.
- Uses one shared Wolf entry surface in both Classic and Player scoring modes and preserves declarations when that surface is absent.
- Adds Wolf status, quick-scoreboard, player detail, settlement, Story input, Scores scorecard, and Ledger Entry sections.
- Blocks round completion when a scored Wolf hole lacks a valid declaration.
- Excludes Wolf from Shared Match upload and hydration and refuses local-to-shared conversion while Wolf is selected.
- Preserves existing localStorage records and Supabase contracts; no migration is required.

## Release gate

- Wolf rule, rotation, handicap, declaration, final-hole, persistence, local-only, settlement, presentation, and report fixtures are covered by the focused v31.0.42 test suite.
- Full unit, lint, validation, simulation comparison, and report layout gates remain required before release.
