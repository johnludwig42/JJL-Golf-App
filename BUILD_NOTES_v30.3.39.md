# BUILD_NOTES_v30.3.39.md

Build v30.3.39 — Scoring UX Cleanup & Runtime Error Fix

## Summary
- Corrected the v30.3.38 Smart Score Advance implementation to remove same-hole player-to-player auto focus and prevent runtime errors.
- Preserved the preferred blank-score model: gross scores start blank, first `+` or `-` initializes to par, and subsequent taps adjust up/down.
- Kept Smart Score Advance only for the no-stat-tracking case: when all players have valid gross scores, the app may advance to the next playable hole using the existing safe hole navigation path.
- Tightened the iPhone scoring row so the Net column remains visible.
- Repaired sticky app chrome behavior by resolving competing fixed/sticky CSS rules with a final app-shell override.

## Root Cause — `saveCurrentHole` ReferenceError
The v30.3.38 Smart Score Advance code called `saveCurrentHole(...)` from score-entry helper functions outside the local scope where `saveCurrentHole` was defined. On iPhone, that created repeated `ReferenceError — Can't find variable: saveCurrentHole` entries in Recent App Errors.

## Fix
- Exposed the existing known-good `saveCurrentHole` handler through a controlled app-level reference for scoring helpers.
- Removed direct calls to unavailable save/navigation functions from the Smart Score Advance helper path.
- Added a fallback to `persistCurrentMatch(...)` if the save handler is unavailable.

## Smart Score Advance Simplification
- Removed same-hole next-player focus movement.
- Removed same-hole auto-scroll behavior.
- Removed dependency on haptic confirmation for iPhone.
- Preserved the 200 ms completion window for no-stat-tracking end-of-hole auto-next behavior.
- With stat tracking ON, users remain on the current hole and intentionally tap Save Hole Scores / Next.

## Haptic Decision
Haptic feedback is no longer treated as a required iPhone behavior because iOS Safari/PWA does not reliably support `navigator.vibrate()`. The confirmation experience now relies on a visual score flash.

## Visual Confirmation
- Score confirmation flash is decoupled from auto-advance.
- Gross score flashes briefly when a changed gross score is committed.
- The flash does not change row height or layout.

## iPhone Scoring Row Width
- Reduced gross `-` / `+` button diameter.
- Reduced gross score box width.
- Tightened row padding on the scoring table.
- Preserved the existing scoring layout while making room for Player, Team, Gross, Strokes, and Net columns.

## Sticky Tabs / App Shell
- Added a final app-shell override to resolve competing historical sticky/fixed rules.
- The app chrome is fixed with content offset based on the measured chrome height.
- Print layout resets the app chrome to static.

## Tests Added / Updated
- Updated Smart Scoring helper tests to reflect simplified behavior.
- Added coverage that Smart Score Advance no longer moves focus to same-hole players.
- Added blank-score counting helper coverage.

## Verification
- `npm run test:money` passed.
- `npm test` passed.
- `npm run validate` passed.

Manual iPhone/browser verification still recommended for sticky app shell behavior, score confirmation feel, and no-stat-tracking auto-next behavior.

## Files Changed
- `app.js`
- `style.css`
- `scripts/smart-score-advance.js`
- `tests/smart-score-advance.test.js`
- `index.html`
- `service-worker.js`
- `manifest.json`
- `package.json`
- `package-lock.json`
