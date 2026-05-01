# The Dye Ledger v27.17 Build Notes

## Scope
Game Setup clean-slate reset and Classic Scorecard navigation review only.

## Changes
- Added a canonical clean-slate setup reset path for Create New Match.
- Ensured Create New Match clears the active match reference, edit mode, current hole/scoring state, player/team selections, tees, selected games, stat tracking, notes, and setup draft state before loading a new setup.
- Prevented the setup preservation routine from rehydrating the prior active match during the clean reset path.
- Verified the Classic Scorecard live cells still navigate to Scoring Input for the selected hole without changing scorecard rendering, styling, or export behavior.
- Incremented app/cache/version markers to v27.17.

## Files Changed
- app.js
- index.html
- service-worker.js
- README.md
- V27_17_NOTES.md

## QA Summary
- JavaScript syntax check passed with `node --check app.js`.
- Static audit confirmed all Create New Match paths still flow through `beginCleanNewMatchSetup()` / `clearActiveMatchForNewSetup()` and now land in the canonical `resetToBlankMatchSetup()` helper.
- Static audit confirmed Classic Scorecard cells still include `data-scorecard-edit` / `data-edit-hole` attributes and the leaderboard click handler still switches to the Scoring Input tab for the selected hole.
- No scoring, payout, PDF/export, or Classic Scorecard visual rendering logic was intentionally changed.
