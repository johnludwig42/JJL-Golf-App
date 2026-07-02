# Build Notes v30.3.33 — Match Summary & Recap Polish

## Summary
v30.3.33 is a focused reporting/UX polish release for The Dye Ledger Match Summary. It improves the exported/printable report presentation without changing scoring logic, payout math, handicap logic, Supabase schemas, saved-match compatibility, or the Classic Scorecard layout.

## Round Snapshot Consolidation
- Replaced the duplicate Scorecard Snapshot + standalone Round Awards export presentation with one consolidated **Round Snapshot** section.
- Round Snapshot uses the prior Scorecard Snapshot concept as the foundation, but presents a more polished executive-summary card.
- Round Awards are now compact highlights inside Round Snapshot rather than a duplicate full export section.
- Round Snapshot includes status, course/tee/date, players, key settlement/game highlights, low gross/net, compact awards, and an AI recap teaser when available.

## Page-Break / Print Improvements
- Added print-friendly keep-together styling for Round Snapshot and major Match Summary cards.
- Improved Match Summary export hierarchy so the report reads: Snapshot → Settlement → Games → Scores → Stats → Details → Recap.
- Added print-specific refinements for Round Snapshot grids, compact card spacing, and section wrappers.
- Preserved graceful breaking for naturally large sections such as Classic Scorecard and Gross Game Detail.

## Incomplete / Provisional Wording
- Added clearer Round Snapshot status language for:
  - Complete Round
  - Incomplete Round — Provisional
  - Clinched Early
- Incomplete reports now more clearly indicate when results are through completed holes only.
- Clinched-early messaging now explains that the result is final based on completed holes when existing app logic already determines the selected games are final.

## AI Round Recap Polish
- Renamed the export section to **AI Round Recap**.
- Added a concise description of recap inputs.
- Added a professional empty state when no recap exists.
- Added incomplete/provisional labeling for recap output when the round was not fully completed.

## Empty-State Improvements
- Improved the no-games-selected summary messaging.
- Added compact empty-state card styling for report sections that have no generated content.

## Files Changed
- `app.js`
- `index.html`
- `manifest.json`
- `package.json`
- `package-lock.json`
- `service-worker.js`
- `BUILD_NOTES_v30.3.33.md`

## Verification
- `node --check app.js`
- `npm run test:money`
- `npm run test`
- `npm run validate`

## Notes
- No scoring logic changed.
- No payout math changed.
- No Supabase schema changes were made.
- Classic Scorecard layout was not redesigned.
- v30.3.32 money math tests were preserved.
