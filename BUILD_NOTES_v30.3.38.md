# BUILD_NOTES_v30.3.38.md

## Release
Build v30.3.38 — Smart Score Advance & Sticky Tabs

## Summary
This release adds a Match Setup Smart Score Advance preference, modernizes gross score entry to support blank-to-par +/- stepping, adds subtle haptic/visual confirmation on completed score entry, and strengthens sticky top tab behavior for iPhone-first navigation.

## Smart Score Advance
- Added a Smart Score Advance setup preference stored with the match and Match Templates.
- Replaced the prior broad auto-advance behavior with a narrower 200 ms completion window.
- Smart Advance focuses only the next blank gross score on the same hole while scores remain.
- With stat tracking on, all-player completion stays on the current hole so stats can be entered intentionally.
- With stat tracking off, all-player completion can safely advance to the next playable hole using existing navigation.
- Disabled Smart Advance for completed matches/review behavior and invalid/unsupported cases.

## Gross Score Entry
- Gross score fields remain blank until the golfer acts.
- First + or - initializes a blank score to the hole par.
- Subsequent + or - taps adjust the score from there.
- Direct numeric entry remains supported.

## Haptic and Visual Confirmation
- A light haptic is attempted when supported after completed Smart Score Advance commits.
- Score fields receive a subtle no-layout-shift confirmation flash on completion.

## Sticky Tabs
- Reinforced the sticky app shell and primary tab bar behavior so top tabs remain available during vertical scrolling.
- Print/PDF behavior is preserved by disabling sticky positioning in print.

## Testing
- Added helper-level Smart Score Advance tests for blank-to-par stepping, same-hole next blank selection, disabled/editing behavior, stat-tracking on/off end-of-hole behavior, and the 200 ms completion window.
- Verified existing money math tests pass.
- Verified full test suite passes.
- Verified release validation passes.

## Files Changed
- `index.html`
- `app.js`
- `style.css`
- `service-worker.js`
- `manifest.json`
- `package.json`
- `scripts/smart-score-advance.js`
- `tests/smart-score-advance.test.js`
