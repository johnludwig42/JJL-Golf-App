# The Dye Ledger v27.28 Build Notes

## Scope
Narrow Score Distribution and Scoring Input UI cleanup release.

## Changes
- Score Distribution is now shown for all matches regardless of the manual Stat Tracking toggle.
- Score Distribution continues to use gross score vs. par and only fully completed holes.
- Score Distribution categories are now: Player, Eagle, Birdie, Par, Bogey, Double Bogey, and Other.
- Hole-in-ones, albatrosses / double eagles, triple bogeys or worse, and other unclassified scores now count in Other.
- Hidden the Scoring Access preview card from the Scoring Input tab without removing the underlying scoring-access/Supabase data structures.
- Updated app, manifest, service-worker cache, and README version references to v27.28.

## Guardrails
- No scoring calculation changes.
- No payout logic changes.
- No PDF/export architecture changes.
- No Classic Scorecard rendering/styling changes.
- No Supabase/backend logic removed.

## QA Summary
- JavaScript syntax check passed with `node --check app.js`.
- Confirmed Score Distribution rendering is no longer gated by Stat Tracking.
- Confirmed HIO/albatross categories were removed and those outcomes now route to Other.
- Confirmed Scoring Access card is hidden on Scoring Input while underlying controls/data remain intact.
