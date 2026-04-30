# The Dye Ledger v27.13 — Lifecycle Model + PDF Score Notation

## Round lifecycle
- Confirm Finish now leaves the completed match loaded for review/share/export instead of clearing active state.
- New Match is now the explicit action that clears the active match context.
- If an unfinished match is active, New Match opens a blocking modal with:
  - Save & Start New Match
  - Start New Without Saving
  - Cancel
- Save & Start New Match saves the existing match using the centralized persistence helper, syncs shared matches when possible, then clears active state only after the save step succeeds.
- Completed matches can be cleared cleanly by New Match without blocking.
- Starting fresh clears active match id, current hole, editing state, scoring focus/timers, shared resume state, and pending shared sync flags for the prior active match.

## Centralized persistence
- Added `persistCurrentMatch(...)` as the shared persistence helper used by Confirm Finish and Save & Start New Match.
- The helper captures the current hole DOM state, normalizes the match, persists local state, and schedules/flushes Supabase sync for shared matches.

## Game Setup buttons
- Added a top Create Match button beside New Match / Edit Active Match / Update Match.
- The bottom Create Match button remains in place.
- The top and bottom Create/Update buttons submit the same match form path.

## Match Summary PDF score notation
- Classic Scorecard score notation now uses export-safe inline styling in addition to existing classes.
- Birdie/eagle circles use the app green treatment.
- Bogey/double-bogey squares use the app gold treatment.
- Scorecard dimensions and layout were not changed.
