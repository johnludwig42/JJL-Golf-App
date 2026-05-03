# The Dye Ledger v27.30 Build Notes

## Scope

Narrow Match Summary PDF/export content-order update only.

## Changes

- Added Score Distribution to the Match Summary PDF immediately after the Classic Scorecard section.
- Score Distribution is included in the Match Summary PDF regardless of whether Stat Tracking is enabled.
- Reused existing Score Distribution logic: completed holes only, gross score vs. par, and current categories of Eagle, Birdie, Par, Bogey, Double Bogey, and Other.
- Added a clean "No completed holes yet." message in the Match Summary PDF when no holes are fully completed.
- Updated app, manifest, service-worker cache, and README version references to v27.30.

## Guardrails

- No scoring calculation changes.
- No payout logic changes.
- No live Scoreboard layout changes.
- No Stat Tracking calculation changes.
- No Classic Scorecard rendering, styling, or dimension changes.
- No PDF/export architecture changes beyond inserting the Score Distribution section.

## QA Summary

- `node --check app.js` passed.
- Verified Score Distribution export section is rendered immediately after Classic Scorecard in the Match Summary body.
- Verified the export section uses existing completed-hole/gross-score Score Distribution helpers.
