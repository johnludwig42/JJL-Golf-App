# The Dye Ledger v27.16 Build Notes

## Scope
Game Setup lifecycle and UI correction release only.

## Changes
- Standardized the top Game Setup button row so Create New Match, Edit Match, and Finalize Match Setup share the same base secondary styling, sizing, font treatment, spacing, and row alignment.
- Reworked Create New Match behavior so it no longer silently clears an active match.
- Added a two-step active-match confirmation flow:
  - Step 1 confirms whether the user wants to create a new match instead of editing the current one.
  - Step 2 asks whether to finish and confirm an unfinished active match before creating a new setup.
- Added Edit Current Match handling from the confirmation dialog while preserving the active match ID.
- Added Finish & Confirm Current Match handling from the confirmation dialog, using the existing finish/confirm round path before opening a clean new-match setup.
- Kept Create New Match with no active match as an immediate clean setup reset with user feedback.
- Incremented app and service worker/cache version markers to v27.16.

## Guardrails Observed
- No scoring calculation changes.
- No payout logic changes.
- No PDF/export architecture changes.
- No Classic Scorecard rendering changes.

## Files Changed
- app.js
- index.html
- style.css
- service-worker.js
- README.md
- V27_16_NOTES.md

## QA Summary
- JavaScript syntax check passed with `node --check app.js`.
- Verified v27.16 version markers in app.js, index.html, service-worker.js, and README.md.
- Verified the prior v27.15 build notes were removed and only v27.16 notes remain.
- Verified the modal now has explicit Cancel, Edit Current Match, Create New Match, Create New Match Anyway, and Finish & Confirm Current Match paths.
- Verified the top Game Setup row uses matching secondary-style button classes for the three primary setup actions.
