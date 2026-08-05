# The Dye Ledger v30.3.87 Build Notes

## Release purpose

v30.3.87 is a focused AI Recap Service Reliability release. It repairs the raw OpenAI Responses API parsing path, makes service failures actionable, preserves reviewable drafts, and adds a controlled one-attempt correction path. It does not change scoring, settlement, local persistence keys, production Supabase, or historical RoundRecords.

## Implemented

- Parses structured text from the raw Responses API `output[].content[]` contract while retaining compatibility with `output_text` wrappers.
- Returns stable, sanitized Edge Function error codes for contract mismatch, missing configuration, rate limits, provider failures, invalid requests, and empty responses.
- Distinguishes deployment, authorization, content-version, configuration, rate-limit, provider, and connectivity failures in the app.
- Stores only sanitized error code, HTTP status, and timestamp; it never stores provider keys, authorization headers, prompts, Round Notes, Memories, or recap text in diagnostics.
- Makes one controlled repair request when deterministic recap validation finds missing required content.
- Preserves a generated draft and lists review issues when the repair attempt still does not satisfy the content contract.
- Continues to require host review and acceptance before a recap becomes the accepted Match Summary artifact.

## Compatibility and persistence

- No localStorage key or persisted record is deleted or renamed.
- Existing rounds, accepted recaps, drafts, scores, statistics, Memories, courses, Shared Match records, and RoundRecords remain intact.
- Recap generation failure cannot block scoring, round completion, Match Summary, PDF generation, or local saves.

## Security and deployment

- No production function, secret, data, schema, RLS policy, or deployment was changed while developing this release.
- The repository function requires secret names `OPENAI_API_KEY` and `OPENAI_RECAP_MODEL`; values must never appear in source, logs, tests, or reports.
- Test deployment and live deployment remain separate authorization gates documented in `docs/AI_RECAP_DEPLOYMENT_v30.3.87.md`.

## Manual acceptance

- Generate a recap for a completed round with games, Memories, weather, and tracked statistics.
- Generate a recap for a completed round with no selected games.
- Verify a service failure leaves scores and Match Summary available and shows an actionable, non-sensitive status.
- Verify a validation failure preserves a visible draft with review items and prevents acceptance until corrected.
- Verify an accepted older recap remains accepted when regeneration produces a new draft.
- Upgrade an installed iPhone PWA and confirm all existing local data remains available.

## Deferred deployment gate

- Inventory the intended Supabase project and existing `round-recap` function without exposing secrets or private round content.
- Deploy and test the candidate in an explicitly designated non-production environment.
- Production deployment requires separate Product Owner approval after test evidence is reviewed.

## Automated verification

- Focused recap and round-story suite: 22 passed, 0 failed.
- Default pretest gate: 18 passed, 0 failed.
- Full regression suite: 324 passed, 0 failed.
- Extended simulation: 2,525 rounds, 0 failures, and 2,525 exact live-versus-mirror matches.
- Release validation: passed.
- Release sanity: 6 passed, 3 expected working-tree/target warnings, 0 failed.
- Syntax checks: application, service worker, and response parser passed.
- Lint: 0 errors and 160 pre-existing warnings.
