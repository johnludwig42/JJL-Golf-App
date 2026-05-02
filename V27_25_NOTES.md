# The Dye Ledger v27.25 Build Notes

## Scope
Targeted Create New Match and reopened-round lifecycle patch.

## Changes
- Fixed Create New Match from a completed active round by skipping defensive DOM score capture for matches already marked `complete`.
- Added code comment documenting why completed rounds must not be passively captured before Create New Match.
- Decoupled `applyCurrentHoleDomToMatch()` from reopening completed rounds; it now captures DOM values into match state and returns whether anything changed without changing round status.
- Moved completed-round reopen behavior to the user-initiated Save Hole Scores path, and only when the saved values actually changed.
- Preserved `previousCompletedAt` and `reopenedAt` when submitting edited match setup so reopened-round context is not lost.
- Bumped app, manifest, service-worker cache, README, and build notes to v27.25.

## Validation Notes
- Traced completed active match → Create New Match: expected clean blank setup without conflict dialog or reopen toast.
- Traced completed active match with unsaved typed score → Create New Match: expected clean blank setup and discard of unsaved DOM score.
- Traced completed active match → Save Hole Scores after changed score → reopened active state; subsequent Create New Match should show unfinished conflict flow.
- Traced active match with scores → Create New Match: unfinished conflict flow remains intact.
- Ran `node --check app.js` successfully.
