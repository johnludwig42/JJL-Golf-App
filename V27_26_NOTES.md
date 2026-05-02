# The Dye Ledger v27.26 Build Notes

## Scope
Surgical Create New Match crash fix.

## Changes
- Removed the three dead `pendingScoreFocus` references from `startCleanNewMatchSetup`.
- Left the valid `pendingScoreCommitFocus` reset intact.
- Bumped app, manifest, service-worker cache, README, and build notes to v27.26.

## QA
- Confirmed `grep -n "pendingScoreFocus" app.js` returns zero matches.
- Ran `node --check app.js` successfully.
