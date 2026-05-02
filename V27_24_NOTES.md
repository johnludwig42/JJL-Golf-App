# The Dye Ledger v27.24 Build Notes

## Scope
Round lifecycle and Create New Match refinements based on the v27.23 audit. No scoring, payout, PDF/export, or Classic Scorecard rendering changes were intended.

## Changes
- Bumped visible app version, manifest version/start URL, and service-worker cache version to v27.24.
- Updated Create New Match handling for active unscored matches: the user now gets a single confirmation to discard the unscored setup instead of the full active-match conflict dialog.
- Added defensive current-hole DOM capture before opening the Create New Match dialog so choosing Edit Current Match preserves typed scores that had not yet been navigated away from.
- Updated Cancel behavior in the Create New Match dialog so pending Finish Round confirmation state is always disarmed.
- Removed the dialog backdrop click listener, leaving the modal blocking by explicit button choice only.
- Updated Setup-tab Finish Round controls so they appear for any non-complete active match, regardless of whether the match editor is currently open.
- Added an explicit prompt when loading a completed saved match to choose between reopening for editing or viewing the leaderboard/scorecard.
- Added reopened-round messaging to the Scoring tab meta line and Scoreboard round state.
- Relabeled Finish Round buttons for reopened rounds to Save Updates & Finish and Confirm Save Updates.
- Updated reopened-round finish toast to confirm the existing saved match record was overwritten.
- Clarified score DOM comparison in applyCurrentHoleDomToMatch to avoid reopening a completed match for no-op score interactions.
- Added a shared-sync code comment documenting the upsert-by-id overwrite contract for reopened shared matches.

## Files Changed
- app.js
- index.html
- manifest.json
- service-worker.js
- README.md
- V27_24_NOTES.md

## QA Summary
- JavaScript syntax check passed with `node --check app.js`.
- Traced no-active Create New Match path: reset helper runs directly without dialog.
- Traced active unscored match path: single discard confirmation appears before clean setup reset.
- Traced in-progress match path: intent dialog can proceed to unfinished dialog, and Finish & Confirm saves before opening clean setup.
- Traced completed-match load path: user is prompted to reopen for editing or view leaderboard/scorecard.
- Verified Setup, Scoring, and Scoreboard finish buttons are now controlled by active match completion state rather than Setup editor state.
