# The Dye Ledger v27.3 notes

Changes included in this build:

1. Match Status box sizing
- Standardized Match Status tiles so they render with uniform sizing.
- Added fixed box sizing, consistent padding, shared min-height, and stretch behavior across the grid.
- Keeps mobile layout at one column while preserving consistent card sizing.

2. Scoring input auto-advance
- Score entry now auto-advances after approximately 300ms of no additional typing.
- The timer resets on each keystroke, so multi-digit values like 10 and 11 can be entered naturally.
- Pressing Enter still commits immediately.
- Blur still commits safely.
- Unchanged fields do not trigger a move.
- Save/sync continues to route through the existing saveCurrentHole path, so Supabase shared-match syncing remains intact.

3. Putts default behavior
- Putts now default to 0 instead of blank.
- On focus, the putts value is auto-selected so the user can type directly over the 0 without manual deletion.
- Saving stats treats blank putts as 0.

Version
- App version advanced to v27.3.

Upload note
- Preserve your existing supabase-config.js values when uploading this build.
