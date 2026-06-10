# The Dye Ledger v28.8 Build Notes

Focused release: Round Recap reliability fix.

## Changes

- Replaced the heavy v28.7 Round Recap QC workflow with lightweight deterministic validation.
- Removed second AI validation / auto-regeneration from the `round-recap` Edge Function to avoid Supabase timeout / 502 errors.
- Preserved conservative factual validation for explicit low-gross, low-net, and clear game-result contradictions.
- Kept natural paragraph formatting and first-page recap fit goals.
- Preserved coaching-observation guidance using available statistics only.

## No Changes

- No scoring changes.
- No settlement changes.
- No Supabase schema changes.
- No localStorage migration.
- No Classic Scorecard changes.
- No Momentum Chart changes.
- No changes to `scorecard-import` Edge Function.

## Deployment Reminder

After uploading the app files, redeploy the Round Recap function:

```powershell
supabase functions deploy round-recap --no-verify-jwt
```
