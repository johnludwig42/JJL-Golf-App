# The Dye Ledger v27.42 — scorecard-import Supabase Edge Function

This package contains the updated Supabase Edge Function backend for the v27.42 multi-image scorecard import workflow.

## Files

- `supabase/functions/scorecard-import/index.ts`

## What changed in v27.42

- Supports the existing single-file payload.
- Adds support for a multi-file payload using a `files` array.
- Sends all images/PDFs to OpenAI Vision together so front/back scorecard photos can be merged into one course.
- Preserves the same response schema expected by the PWA.

## Deployment

In the Supabase Dashboard, open Edge Functions → `scorecard-import` → Code, replace `index.ts` with this file, and click **Deploy updates**.

`OPENAI_API_KEY` must remain configured as an Edge Function secret. Keep Verify JWT off until The Dye Ledger adds user authentication.
