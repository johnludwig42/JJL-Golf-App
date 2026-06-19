# The Dye Ledger v30.1 Notes

## Release Theme
Always provide an escape hatch.

## What Changed
- Added a visible **Cancel** button to the Game Setup form for new match creation.
- Added the same **Cancel** action for existing match setup edits.
- Added a top setup Cancel action beside the Create Match / Update Match controls.
- Cancel from a new setup returns to the Create New Match / Join a Match choice menu without creating a match.
- Cancel from an existing setup edit discards unsaved form edits and returns to the active match experience.
- Updated version references and cache metadata to v30.1.

## Guardrails Confirmed
- No scoring engine changes.
- No handicap calculation changes.
- No Nassau or settlement calculation changes.
- No multi-round session logic changes beyond preserving pending next-round context on cancel.
- No Supabase schema changes.
- No localStorage key or data model changes.
- No course synchronization behavior changes.

## Files Modified
- app.js
- index.html
- style.css
- manifest.json
- service-worker.js
- README.md
- V30_0_1_NOTES.md
