# AI Recap Deployment and Rollback Guide — v30.3.87

No Supabase project, Edge Function, secret, production record, or external provider was changed during local implementation.

## Read-only inventory gate

After explicit authorization, confirm the intended project reference independently from the URL embedded in the web client. Record only:

- project reference and environment label;
- whether `round-recap` exists;
- deployed version or source hash when available;
- deployment timestamp and JWT verification mode;
- presence, never values, of `OPENAI_API_KEY` and `OPENAI_RECAP_MODEL`;
- non-sensitive request counts grouped by HTTP status and stable failure code.

Never print project credentials, authorization headers, provider keys, Round Notes, Memories, request bodies, generated recaps, or user identifiers.

## Non-production deployment gate

1. Require an explicitly designated test project.
2. Preserve the current function artifact and configuration for rollback.
3. Configure the required secret names in that test project.
4. Deploy `supabase/functions/round-recap` from this repository.
5. Run synthetic requests covering success, no-games, repair, 409, 429, 502, and 503 behavior.
6. Confirm malformed and unauthorized requests fail closed.
7. Complete browser acceptance without using private production round content.

## Production gate

Production deployment requires separate Product Owner approval. Confirm the web client project reference matches the approved target before deploying. Apply no schema or data migration for this release.

## Rollback

Restore the preserved prior function artifact and its prior non-secret configuration. Rollback must not alter local rounds, accepted recaps, RoundRecords, Auth accounts, RLS, course data, or Shared Match records.
