# v31.0.25 — Setup and Library Input Reliability

## Summary

This release keeps Course, Player, and tee selections stable when the app rerenders and makes the searchable Match player assignment list dependable for large player libraries on desktop and mobile.

## Changes

- Preserves the selected Course while adding a tee across repeated app renders.
- Applies the same fail-closed selection preservation to calculator Player, Course, and tee controls.
- Keeps the searchable player combobox and orders its unfiltered choices by derived round recency, then alphabetically.
- Orders filtered results by exact, prefix, word-prefix, and substring match quality.
- Shows filtered and total player counts.
- Contains list scrolling, adapts above/below placement to available viewport space, and recalculates while the viewport changes.
- Allows touch dragging to scroll rather than selecting an option on pointer-down.
- Preserves assignment, exclusion, clearing, keyboard navigation, and setup scroll-anchor contracts.

## Compatibility

- No persistence or local-storage schema change.
- No database migration.
- No scoring, handicap, tee, team, Course Library publication, synchronization, settlement, or reporting changes.
