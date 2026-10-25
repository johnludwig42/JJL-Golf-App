# Shared Match staging verification

Prepared October 24, 2026 against v31.0.80, commit `2519e0e`.
This package changes no application behavior, SQL proposal or production service.
The owner identified staging as `darbakmabpbkikisadop.supabase.co`.
Production `ueallqqmdyzwdlmoyxfo` is explicitly refused by the API preflight.

## Current result

See [local preparation results](RESULTS.md) for actual counts and unverified gates.
The supplied catalog shows an empty application schema; see the
[baseline review and next steps](BASELINE_REVIEW.md) before any installation.
The October 25 schema export is now reviewed; see the
[locally rehearsed baseline installation package](BASELINE_PACKAGE.md).
The supplied post-install query (16) now confirms application baseline parity.
Do not reinstall the baseline. Compare provider settings next; RPC installation
and real Auth/RLS/Realtime verification remain pending.
Supplied settings now confirm matching schema/default ACLs, with automatic RLS
present only in production. See [staging alignment review](AUTO_RLS_REVIEW.md) for
the prepared, locally tested addition before the RPC rehearsal.
Post-alignment query (18) confirms these settings now match production. No further
baseline or settings installs are needed. The next input is the staging publishable
API key for isolated real-service testing; no password, secret key or service-role
credential should be supplied in chat. RPC installation follows baseline testing.

**NOT READY for production.** No staging SQL has been applied and no real-service
delivery, authentication, Realtime or rollback test has been executed by this package.
The earlier 75 local SQL checks used synthetic auth/Realtime, not Supabase services.
The client test suites likewise do not prove deployed database behavior.

## 1. Capture the starting point (read-only)

In the staging Dashboard, confirm project reference `darbakmabpbkikisadop`.
Run `scripts/check-shared-delivery-production.sql` in its SQL Editor and export the
single JSON result as CSV. Despite the filename, this is a catalog-only SELECT;
it reads no golfer/score/account records and installs nothing. Save the export
under ignored `tmp/report-qa/shared-staging/`. Capture a fresh production catalog
with the same read-only query for comparison with the October 20 audit.

Run `staging/preflight-read-only.sql` for the focused prerequisite inventory.
Review all 13 migrations against object definitions, policies, grants, triggers,
constraints and indexes, rather than trusting migration-history rows alone.
Confirm the `extensions.digest(text,text)` and eight-argument RECORD broadcast
signatures, membership helper and application account-provisioning trigger.

The audited production baseline has 10 cumulatively applied migrations, one
partial and two absent. Staging must reproduce the relevant deployed baseline
before the proposal is tested. A fresh database built by replaying all repository
migrations is a different starting point and cannot demonstrate this rollout.
If staging differs, document the delta and prepare a reviewed baseline plan first.
Use synthetic users/matches only. Preserve Supabase-managed auth/Realtime internals;
application schema and the specific application auth trigger need separate review.
Never run `supabase/tests/shared_score_rpc_review/fixture.sql` on Supabase: it
substitutes synthetic auth and Realtime services for the local SQL rehearsal.

## 2. Run the guarded API preflight

Copy `config.example.json` to ignored
`tmp/report-qa/shared-staging/config.json`. Set the confirmed reference and URL,
and leave `phase` as `baseline`. Do not change `supabase-config.js` or the live app.

Generate a local fingerprint plan without credentials or network access:

```powershell
node scripts/shared-match-staging-preflight.js --config tmp/report-qa/shared-staging/config.json --output tmp/report-qa/shared-staging/plan.json
```

For service probes, supply `DYE_STAGING_PUBLISHABLE_KEY` locally through the process
environment. Use the staging publishable/legacy anon key, never a service-role or
secret key. Ordinary test sessions may be supplied locally using
`DYE_STAGING_HOST_JWT`, `DYE_STAGING_SCORER_JWT`,
`DYE_STAGING_SAME_ACCOUNT_JWT`, `DYE_STAGING_GUEST_JWT` and
`DYE_STAGING_OUTSIDER_JWT`. Do not paste session tokens into chat or commit them.
The script validates sessions through Auth; decoding a JWT alone proves nothing.

```powershell
node scripts/shared-match-staging-preflight.js --config tmp/report-qa/shared-staging/config.json --probe --role host --output tmp/report-qa/shared-staging/baseline-api.json
```

Default role is anonymous. Allowed phases: `baseline`, `installed`, `rolled-back`,
`restored`. Every request has a ten-second timeout and refuses redirects. Probes
read zero match rows and call the audited RPC with an empty validation batch.
Baseline/rollback expect PGRST202; installed/restored require an authenticated
session and the RPC's 22023 validation response. Unexpected baselines stop the
sequence; an already-installed RPC requires its own comparison, not overwriting.
No API preflight result marks any delivery gate passed. Saved results omit raw
responses, returned account rows, request headers and credentials.

## 3. Execute and record the staging matrix

After the catalogs agree and prerequisites are reviewed, execute the existing
`install-review.sql` **only on confirmed staging**, with its explicit
`dye.shared_rpc_review_authorized=reviewed-install` session guard. Keep SQL guards
intact. This document deliberately does not provide a production command.
The baseline plan must be reviewed before any staging installation.

Use the current client in a separate staging origin with its configuration loaded
before `supabase-config.js`. Do not repoint the published PWA or share its browser
storage. Record client commit, SQL hashes, server versions, test account roles,
device identities and timestamps. Use two ordinary scorer sessions, two devices
on the same account, a guest and an unrelated authenticated outsider.

| Gate | Actual-service acceptance evidence |
| --- | --- |
| Baseline direct delivery | Create/join/start using real Auth and RLS. Assigned scorers can write eligible cells; outsider and ineligible assignments cannot. Record visible direct transport. No server operation ledger/idempotency/attribution is claimed on this path. |
| RPC delivery | Repeat with installed RPC. Test 72, 144 and 576 queued operations, at most 64 per request with partner pairs together. Compare every acknowledged cell and receipt, including statistics. |
| Lost acknowledgement | Retry the identical operation ID/payload, including after a later valid correction; original receipt replays without overwriting the correction. Changed payload with reused ID refuses. |
| Auth and retry | Expire a real test session; refresh once and retry. Failed refresh keeps identity and every pending score with sign-in guidance. Reload during backoff, wake/lock repeatedly, reconnect and change assignments while writes are queued. Record client behavior separately from server evidence. |
| Isolation and storage | Hang one match request while another progresses. Deny local persistence and exceed the former global 1,000-operation pressure point; no unacknowledged score disappears. Heartbeat success alone never indicates delivery/parity. |
| Parity | Empty outbox with missing server cells remains unconfirmed. Verify actual cell parity and stale-device unknown indicators independently of contact and acknowledgement. |
| Private Realtime | Authorized member receives a private match notification; outsider subscription is denied. Inspect match-ID-only notification and confirm subsequent authoritative pull. Do not substitute the synthetic broadcast stub. |
| Cache/error behavior | Observe actual PGRST202 during an absent/stale-cache RPC condition and the visible direct fallback. A non-PGRST202 RPC failure must not silently downgrade. If a real cache-lag window cannot be reproduced, record NOT_RUN; a client mock does not prove it. |
| Completion | On RPC AND direct upsert, identical retries after closure are no-ops; new changed values, missing rows, changed stats, deletion and identity moves refuse with P7701. Check statement atomicity and unchanged frozen facts. |
| Completion race | Exercise both lock orders with independent real connections: delivery first commits; completion first refuses late change. Stale metadata cannot clear the closure latch. |
| Preserved review | P7701 drains to durable host-review evidence, pending zero, complete with exceptions. Reload/export/review succeeds without changing settlement. Persistence failure retains pending writes. |
| Rollback | Run reviewed rollback with `reviewed-rollback` guard on staging. Verify direct fallback via real API, retained scores/receipts/revisions and both completion guards. Refresh cache and measure actual errors; do not assume function removal immediately means PGRST202. |
| Restore | Run reviewed restore with `reviewed-restore` guard. Verify old receipts still replay, RPC delivery and private notifications resume, closure protection remains. |
| Two phones | Create, assign both foursomes/eight golfers, score 18 holes, disconnect/reconnect, verify parity, finalize/freeze, save Story and generate Ledger Entry. Verify remote completion and unchanged settlement. |

Record each row as PASS, FAIL or NOT_RUN with evidence location and actual counts.
Stop at a failure and report it before modifying the proposal/client. Do not claim
the synthetic local tests or scripted API validation satisfy these service gates.

## 4. Production decision stays separate

Deliver the before/installed/rolled-back/restored catalogs, real API/Realtime
evidence, two-phone outcome and unresolved findings for approval. Recheck SQL hashes
and client versions before rollout. All devices need the v31.0.78+ preservation
client and v31.0.77 device indicators before server completion protection.
Do not apply the historical RPC migration unchanged, automatically replay the 13
migrations, install the unrelated RoundRecord foundation or repair course-security
findings as part of this delivery proposal.

The reviewed rollback retains closed-round protection and audit data; it does not
restore an unsafe pre-protection server. Financial amendments remain separate work.

## Constitutional review

Implements verification of historical preservation and authorized contributions;
does not change round facts, settlement, identity, authority or data ownership.
The existing proposal's constitutional review still governs its server behavior.
Production execution remains a distinct owner decision after real-service evidence.

Official references: [isolated Supabase environments](https://supabase.com/docs/guides/deployment/managing-environments),
[PostgREST errors including PGRST202](https://supabase.com/docs/guides/api/rest/postgrest-error-codes).
