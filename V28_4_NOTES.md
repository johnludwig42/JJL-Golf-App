# The Dye Ledger v28.4 Build Notes

Focused feature release: optional AI-generated Round Recap.

## Changes
- Added a **Generate Round Recap** control in the Match Summary / Share PDF workflow.
- Added local match persistence for generated recap text, generation timestamp, and status messaging.
- Added **The Dye Ledger Round Recap** section to the Match Summary report when a recap has been generated.
- Added new Supabase Edge Function: `supabase/functions/round-recap/index.ts`.
- Round Recap generation is optional and non-blocking; Match Summary generation continues normally if no recap exists or if AI generation fails.

## Unchanged
- No scoring calculation changes.
- No settlement calculation changes.
- No Classic Scorecard changes.
- No Supabase schema changes.
- No saved-match cloud sync changes.
- Existing matches without recap data continue to load normally.
