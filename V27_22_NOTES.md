# The Dye Ledger v27.22 Build Notes

## Scope
Targeted Create New Match workflow stabilization based on the v27.21 code audit.

## Changes
- Reworked the Create New Match confirmation flow so unfinished-match mode is reachable when the active match has entered scores but is not complete.
- Completed matches no longer trigger the active-match conflict dialog; Create New Match opens a clean setup directly.
- Removed the fragile re-entrancy collision where closing the dialog cleared the same in-progress flag used by the reset flow.
- Made the Finish & Confirm Current Match path finish/save the current match, then directly load the clean new-match setup without re-entering the decision tree.
- Added an explicit destructive confirmation for Create New Match Anyway from an unfinished match.
- Made the clean setup reset more atomic by snapshotting active setup state and rolling back if the reset/render path fails.
- Updated backdrop taps on the New Match conflict dialog to provide user guidance instead of silently doing nothing.

## QA Summary
- JavaScript syntax check passed.
- Reviewed Create New Match paths for no active match, active complete match, active unfinished match, Edit Current Match, Finish & Confirm Current Match, and Create New Match Anyway.
- Confirmed all confirmed new-match paths route through the clean setup reset without re-entering handleNewMatchRequest.
