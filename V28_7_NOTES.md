# The Dye Ledger v28.7 Build Notes

Focused Round Recap enhancement release.

## Included
- Added authoritative Round Recap facts to the recap payload, including low gross, low net, leaderboard order, final settlement, game results, Greenies, and stat leaders where available.
- Updated the `round-recap` Edge Function to treat authoritative facts as binding and to perform a factual quality-control validation pass before returning recap text.
- Added one automatic recap revision attempt when validation detects a contradiction.
- Added natural paragraph breaks for generated recaps and preserved paragraph spacing in the Match Summary report/preview.
- Tuned recap guidance to target first-page fit while preserving coaching observations and data-driven player improvement notes.

## Not Changed
- No scoring changes.
- No settlement changes.
- No Supabase schema changes.
- No localStorage migration.
- No Classic Scorecard, Momentum Chart, course sync, or scorecard-import changes.

## Deployment Note
After uploading this version, redeploy the Round Recap Edge Function:

```powershell
supabase functions deploy round-recap --no-verify-jwt
```
