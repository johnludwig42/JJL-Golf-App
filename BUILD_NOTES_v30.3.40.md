# BUILD_NOTES_v30.3.40.md

Build v30.3.40 — Score Stepper Persistence Hotfix

## Summary
This narrow hotfix resolves the v30.3.39 regression where gross scores entered through the new `+ / -` stepper could briefly appear and then reset back to blank (`—`).

## Root Cause
The `+` and `-` stepper buttons used the same `data-score-player` selector identity as real score inputs. Existing persistence, live-score, missing-score, and save loops queried `[data-score-player]`, causing the buttons to be treated like blank score fields and overwrite actual gross scores.

## Fix
- Changed score stepper buttons to use separate metadata: `data-score-step-player` plus `data-score-step`.
- Tightened score persistence/live-score selectors so they target only `input[data-score-player]`.
- Updated score wiring, DOM-to-match persistence, pending focus, save-hole host override checks, unsaved score detection, and viewport stability guards to ignore stepper buttons.
- Preserved the intended score model: blank score starts as `—`, first `+` or `-` initializes to par, and later taps adjust from that value.

## Tests Added / Updated
- Added helper coverage confirming score selectors return only actual score inputs, not `+ / -` buttons.
- Added helper coverage confirming persistable score extraction ignores stepper buttons.
- Existing Smart Scoring, money math, and validation checks were preserved.

## Verification
Validated the release checks:
- `npm run test:money`
- `npm test`
- `npm run validate`

Manual verification checklist for device/browser testing:
- Enter score with `+`; value stays visible.
- Enter score with `-`; value stays visible.
- Enter multiple `+` / `-` taps; value stays visible.
- Save Hole Scores; values persist.
- Next / Prev navigation preserves values.
- Switching tabs and returning preserves values.
- Missing-score count ignores stepper buttons.
- Net score updates from the real gross score input.
- No `saveCurrentHole` ReferenceError returns.

## Files Changed
- `app.js`
- `scripts/smart-score-advance.js`
- `tests/smart-score-advance.test.js`
- `package.json`
- `package-lock.json`
- `index.html`
- `manifest.json`
- `service-worker.js`
