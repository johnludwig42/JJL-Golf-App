# AI Recap Deployment and Live-Inventory Guide — v30.3.84

No production inventory, deployment, secret change, or function mutation was performed during this release.

## Read-only live inventory

Only after the Product Owner explicitly authorizes production inspection:

1. Confirm the intended project reference separately from any local test project.
2. Record the deployed `round-recap` version, deployment timestamp, verification mode, import map, configured secret names (never values), and recent non-sensitive status/error counts.
3. Never print or copy JWTs, API keys, project credentials, request bodies, Round Notes, Memories, or generated recaps into build logs.
4. Compare the live function source hash when available with the repository candidate. If source export is unavailable, record the live source as unknown; do not claim recovery.

## Test deployment gate

- Require an explicitly configured non-production Supabase project.
- Configure `OPENAI_API_KEY` and `OPENAI_RECAP_MODEL` only in that project’s secret store.
- Run the canned content fixtures, authentication/abuse checks, payload-size checks, and failure-path tests.
- Verify that the client continues to score and preserve rounds when recap service is offline.

## Production gate and rollback

Production deployment requires a separate Product Owner approval after test evidence is reviewed. Preserve the previous function artifact and configuration. Rollback restores the prior function artifact; it does not modify local rounds, accepted recaps, RoundRecords, Auth, RLS, or production data.
