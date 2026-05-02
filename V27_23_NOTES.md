# The Dye Ledger v27.23 Build Notes

## Scope
- Stabilized Create New Match clean-reset workflow.
- Added reopened-finished-round lifecycle so edited completed matches can be finished again and overwrite the same saved match.

## Changes
- Rebuilt the Create New Match reset around one atomic clean setup helper.
- Added explicit DOM/form clearing before loading a blank setup draft.
- Prevented completed matches from being treated as in-progress conflicts when starting a new match.
- Added rollback protection if the clean reset fails during render.
- When a completed match is edited through score entry, it is reopened for editing while preserving its saved match ID.
- Confirm Finish now updates the same saved match and shows “Round updated successfully” for reopened rounds.

## QA Summary
- JavaScript syntax check passed.
- Create New Match reset path reviewed for active, completed, and no-active-match states.
- Reopened completed match path reviewed to preserve match ID and update the existing saved match.

## Files Changed
- app.js
- index.html
- style.css
- service-worker.js
- README.md
- V27_23_NOTES.md
