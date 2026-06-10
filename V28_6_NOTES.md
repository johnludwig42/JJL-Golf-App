# The Dye Ledger v28.6 Build Notes

Focused Round Recap enhancement release.

## Changes

- Updated the `round-recap` Edge Function prompt so generated recaps open with the gross scoring storyline before net/handicap context.
- Expanded recap target length to 12-15 sentences where the available round data supports it, with a hard cap of 15 sentences.
- Added constructive, data-driven coaching observations for each player when supported by available stats.
- Preserved existing recap persistence, report placement, and non-blocking failure behavior.

## Unchanged

- No scoring calculation changes.
- No settlement calculation changes.
- No Classic Scorecard changes.
- No Momentum Chart changes.
- No localStorage schema changes.
- No Supabase database schema changes.
- Existing `scorecard-import` Edge Function unchanged.

## Deployment Note

Deploy the updated recap function after uploading this build:

```bash
supabase functions deploy round-recap --no-verify-jwt
```
