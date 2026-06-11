# The Dye Ledger v28.10 Build Notes

Focused release: optional Round Notes for Recap.

## Added
- Added an optional **Round Notes for Recap** multi-line field near the Generate Round Recap controls.
- Round notes are saved locally with the match and remain editable.
- Round notes are included in the structured payload sent to the `round-recap` Supabase Edge Function.
- The `round-recap` prompt now uses round notes as supplemental narrative color while preserving official scoring/statistical data as the source of truth.

## Preserved
- Existing Round Recap generation and QC behavior.
- Existing Match Summary report rendering.
- Existing scoring, settlement, course sync, Classic Scorecard, Momentum Chart, and Gross Game Detail behavior.
- Existing saved matches without round notes continue to load normally.

## Deployment Reminder
Redeploy the updated Edge Function after publishing the app files:

```powershell
supabase functions deploy round-recap --no-verify-jwt
```
