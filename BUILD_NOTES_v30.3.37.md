# The Dye Ledger v30.3.37 — Scores Tab Status Stack Hotfix

## Summary
v30.3.37 is a narrow iPhone layout hotfix for the Scores tab Share / Save PDF area. It removes the remaining partial-box / phantom-card artifacts by flattening the Save / End Round and missing-score warning area into one internal status stack.

## Root Cause
The Share / Save PDF card still contained nested card-like child surfaces for the round action area and missing-score warning. In particular, the missing-score warning was rendered as `details.incomplete-round-warning.card.tight-card` inside another rounded card. On iPhone Safari, those nested rounded cards and borders could paint as partial left-edge boxes behind the holes-completed note, between the Finish / End Round button and the Round Incomplete warning, or along the left edge of the parent card.

The prior containment fixes reduced the issue but did not remove the nested-card structure that caused it.

## Structural Status Stack Fix
- Added a dedicated `.scoreboard-status-stack` wrapper inside the Share / Save PDF card.
- Grouped the round state, Finish / End Round controls, missing-score warning, and post-round inline actions into that internal stack.
- Removed `card tight-card` from the rendered missing-score warning details element.
- Converted the round action area to an internal panel instead of a nested standalone card.
- Scoped CSS so the Scores tab status stack uses one parent card and no nested full-card surfaces.

## CSS / Layout Changes
- Added v30.3.37 scoped status-stack CSS.
- Neutralized nested shadows, margins, duplicate card borders, and competing rounded backgrounds inside the Share / Save PDF card.
- Preserved the iPhone single-column action layout.
- Preserved desktop layout materially, with only the cleaner status stack behavior.

## Regression Verification
Verified with automated checks:

- `npm run test:money` — passed, 17/17
- `npm test` — passed, 17/17
- `npm run validate` — passed

Areas reviewed for unchanged behavior:

- Finish / End Round behavior
- Round Complete / Round Incomplete warning behavior
- Missing-score expanded and collapsed states
- End Round Early modal behavior from v30.3.36
- Match Templates
- Round Readiness
- Featured Competition
- Round Snapshot
- AI Round Recap
- Match Summary
- Classic Scorecard

## Files Changed
- `index.html`
- `app.js`
- `style.css`
- `service-worker.js`
- `manifest.json`
- `package.json`
- `package-lock.json`
- `BUILD_NOTES_v30.3.37.md`
