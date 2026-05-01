# The Dye Ledger v27.19 Build Notes

## Scope
Narrow Game Setup reset and Handicap Preview display fix.

## Changes
- Strengthened the Create New Match clean-reset path so stale DOM player-slot values cannot repopulate Player 1 after reset.
- Explicitly clears existing player/tee slot DOM values before loading the blank setup draft.
- Updated match setup player draft syncing to suppress DOM carryover during the clean-new-match reset path.
- Added each player's Index to the Handicap Preview display.
- Reordered Handicap Preview data flow to: Player | Tee | Index | Course HCP | Playing | Gets.
- Updated version markers and service worker cache to v27.19.

## Guardrails
- No scoring calculation changes.
- No payout logic changes.
- No PDF/export architecture changes.
- No Classic Scorecard rendering or styling changes.

## QA Summary
- JavaScript syntax check passed with `node --check app.js`.
- Verified version markers reflect v27.19.
- Verified Handicap Preview now renders Tee, Index, Course HCP, Playing, and Gets while preserving existing Course HCP / Playing / Gets formulas.
- Verified clean reset path now clears stale player-slot DOM values before repopulating Game Setup.
