# Deployed-schema audit — all 13 migrations

Date: October 20, 2026. Configured project: ueallqqmdyzwdlmoyxfo.
Status: deployed catalog comparison complete; production runtime/role tests pending.
No migration, rollback, policy or grant was applied by this audit.

## Evidence and classification

John supplied `Supabase Snippet Untitled query (12).csv`, captured at
2026-10-21 00:21:50 UTC (October 20, 8:21:50 PM ET). This is treated as the
production export John supplied; this workspace has no live database connection.
It contains schema metadata, not golfer/account records. Retained evidence:

- [Catalog snapshot](audits/v31.0.77-deployed-schema.json)
- [Comparison results and original CSV SHA-256](audits/v31.0.77-schema-comparison.json)
- Collection query: scripts/check-shared-delivery-production.sql

**10 Applied, 1 Partially applied, 2 Absent.** These classifications describe
observable cumulative DDL effects, including later replacements. They do not prove
which historical script ran, whether a data backfill completed, or that the current
schema is secure in every respect. Extra identity-table grants are a separate
finding below; the historical GRANT statements do not revoke those extras.

The migration ledger contains only `202608070001`. It is incomplete as a history of
current schema effects: later function bodies, gender identity and course indexes
are present. Do not replay 12 migrations simply because their ledger rows are absent.

Checks performed: all 12 deployed public application-function bodies match their
latest repository replacements after removing comments and normalizing whitespace;
security-definer/invoker and empty search-path settings match. Function grants deny
PUBLIC/anon execution and retain the intended authenticated execution where
applicable. All 28 deployed policies match their source expressions, commands,
roles and permissive mode. Tables, columns/defaults/nullability, constraints,
indexes, triggers, ACLs and installed extension/function signatures were examined.
No authenticated/guest/outsider requests were executed against production.

## Inventory and client consequences

| Migration | Deployed status | Observed evidence / current consequence | Rollback reference / caution |
|---|---|---|---|
| 202607160001 — .75A course security | **Partially applied** | Ownership/publication fields, roles and later .93 security are present. `courses.source` remains nullable; source/ownership CHECK constraints and all five .75A security indexes are absent. The old permanent-user helper is absent; current .93 helpers do not depend on it. Client publishing can work without these original safeguards/indexes, masking the partial state. | Matching rollback exists but reopens anonymous writes/disables RLS. Do not use it or rerun its obsolete 10/54/972 baseline guard. Prepare a minimal additive delta after data preflight. |
| 202607220001 — identity foundation | **Applied (cumulative)** | All five identity/library/device/provider tables, keys, checks, FKs, provisioning trigger and policies are present. Latest .96 provisioning body matches. Required grants exist, with extra authenticated privileges noted below. Backfill row contents were not queried. | Combined 001–003 rollback exists; destructive to live identity/history and unsuitable here. |
| 202607220002 — RoundRecord security | **Absent** | All seven tables are absent: authoritative_rounds, round_access, round_participations, scoring_assignments, round_record_versions, amendment_sessions, security_audit_log. Their RPCs, immutable triggers and RLS policies are absent. Current browser does not call these publishing RPCs; local frozen reports and legacy matches JSON can still work silently. | Combined rollback unnecessary for absent objects; introducing this foundation requires its own architecture/data rollout. Do not mix it into the score-delivery fix. |
| 202607220003 — catalog/shared target | **Applied (cumulative)** | Anonymous catalog mutation policies are absent; anon has SELECT only on the three catalog tables. Later .93 policies enforce the current catalog boundary. | Combined rollback would reopen permissions/drop live structures; not a routine recovery. |
| 202608060001 — .92 account activation | **Applied (superseded by .96)** | Latest claimed-identity RPC body/security/grants match .96; no PUBLIC/anon execute. Browser profile creation uses this function. | Matching rollback exists but must not restore an obsolete .92 body over .96. |
| 202608070001 — .93 security activation | **Applied** | Ledger row present. Six helper/admission/stamping function bodies match; owner trigger enabled. Catalog/shared RLS and table grants match. Direct score authority is broad membership, not per-device assignment. | Matching rollback relaxes live security; keep baseline definitions for minimal compensating rollback instead. |
| 202608090001 — .96 identity/publish remediation | **Applied** | Identity prerequisites, enabled provisioning trigger, claimed-identity and owner-publication bodies/security/grants present and matching. Extra identity-table ACLs remain a separate finding. | Matching rollback exists; preserve identities/memberships and latest function bodies. |
| 202608100001 — .01 score reliability | **Absent** | No matches.shared_revision, shared_score_operations table/index/policy, score RPC, broadcast function/trigger, or realtime broadcast policy. Production uses direct upserts and polling. Both whole migration absence and silent fallback are now established from the full catalog, not just one missing function. | Existing rollback drops receipt history. Do not deploy this migration or later run that rollback unchanged; see confirmed compatibility blockers below. |
| 202608210001 — .05 hole upsert key | **Applied** | Exact UNIQUE(tee_id,hole_number) constraint and backing index exist. | Matching rollback removes the conflict key; check publisher/upsert dependencies before removal. |
| 202608210002 — .05 atomic publication | **Applied (superseded by .27)** | Latest gender-aware publish_course_draft_atomic body/security/grants match .27. | Matching rollback exists; do not restore an obsolete publisher or introduce partial table writes. |
| 202609020001 — .27 tee gender identity | **Applied** | gender NOT NULL/default M, M/F CHECK and unique course/name/gender index present. Atomic publisher body matches. Missing-gender compatibility fallback is not active for this snapshot. | Matching rollback changes tee identity semantics; avoid historical reinterpretation. |
| 202609020002 — .29 course approval | **Applied** | Latest publish_course body/security/grants match, including UUID/text handling and validation. | Matching rollback restores an older body; retain the current definition for recovery. |
| 202610040001 — .47 course revision | **Applied** | revise_approved_course body/security/grants match. | Matching rollback removes the function; existing course data must remain. |

Rollback filenames correspond to each migration stem plus `_rollback.sql`, except
identity foundation/record security/catalog target share
202607220001_003_v30_3_75_identity_security_rollback.sql. These are identified
references, not approval to execute or a finding that they are safe for live data.

## Client RPC inventory

All nine browser-called RPCs are now accounted for: eight are present with matching
latest bodies/security/grants; the score RPC is absent. Calls include
identity-security.js. Runtime authorization and data outcomes still require role tests.

| Client-called function | Latest repository source | Missing/error behavior |
|---|---|---|
| course_library_can_write() | .93 | Publishing fails closed with visible authorization-unavailable guidance. |
| course_library_is_maintainer() | .93 | Quietly yields isMaintainer=false; restricts controls without granting authority. |
| create_my_claimed_golfer_identity(text,text) | .96, superseding .92 | Visible profile-creation failure; no alternate identity creation. |
| publish_shared_match_owner(jsonb,text,text) | .96 | Host publication/sync fails visibly; no direct owner-admission fallback. |
| join_shared_match(text,text,text) | .93 | Join/access fails visibly; device registration alone does not prove successful download. |
| submit_shared_score_operations(text,text,jsonb) | .01 | Confirmed absent; PGRST202 selects direct score_entries upload. .77 makes this downgrade visible. |
| publish_course_draft_atomic(jsonb) | .27, superseding .05 atomic | Explicit publishing failure; local recovery retained. |
| publish_course(text) | .29, superseding earlier bodies | Explicit approval failure; an older existing body can mask missing newer validation. |
| revise_approved_course(text) | .47 | Explicit unavailable/error guidance; no direct course-revision fallback. |

The authoritative-round creation/access/version RPCs in the July record-security
migration are not current browser calls. Their static tests do not prove that a
locally frozen Ledger has been published through those database safeguards.

## Authority and quiet-fallback findings

1. **Score transport:** v31.0.76 catches PGRST202 and directly upserts score_entries.
   No receipt ledger, payload-hash check, RPC device attribution or RPC 64-row limit
   applies on that path. v31.0.77 labels it and preserves it permanently as an
   explicitly weaker, separately tested deployment/schema-cache path.
2. **RLS scope:** repository .93 `scores_member_all` permits an authenticated active
   match member whose updated_by matches auth.uid(). It does not enforce the
   assigned player/device scope of the score RPC. `matches_member_update` and the
   team/player policies also use broad membership; host authority remains partly
   application-enforced there. These policy definitions are now verified in the deployed export. Deploying the RPC does not revoke direct table access.
3. **Metadata merge:** the upload catch can proceed with local metadata when the
   live merge read fails. That weaker path is now recorded in diagnostics and a
   Needs Attention state; its existing write behavior is retained.
4. **Realtime:** private broadcast is a wake-up signal; polling continues without
   it. Transport/contact/acknowledgement/parity must not be inferred from channel
   subscription success. Missing trigger/policy can hide behind functioning polling.
5. **Course compatibility:** absent gender defaults to M; capability failure can
   hide maintainer-only controls. The gender column is present and current capability bodies match. These are not
   grounds for changing historical course semantics in this shared-delivery release.
6. **Admission payload:** repository join/owner RPCs truncate device_label to 500
   characters. New device telemetry uses compact, versioned JSON and fails visibly
   before truncating identity. Existing full-format reports remain readable.
7. **RPC function resolution:** the repository score RPC sets search_path to the
   empty string but calls unqualified digest(). The export confirms pgcrypto/digest are in
   **extensions**, outside that search path. Qualify it as extensions.digest
   in the proposed corrected rollout and execute a nonempty
   staging batch to verify it. The empty capability probe cannot detect this body
   error. This is a source-level rollout concern, not a deployed failure claim.
8. **Broadcast argument types:** the trigger passes JSONB to broadcast_changes;
   the documented Supabase example passes NEW/OLD records. The installed signature is confirmed as
   new record / old record, not JSONB. Correct this mismatch in the proposed
   rollout, and rehearse trigger execution on both RPC writes and direct upserts. A broken AFTER trigger can abort BOTH paths, so dropping
   only the RPC would not be a sufficient rollback. No change made to the trigger.

9. **Identity table over-grants:** authenticated has `arwdDxtm` (including DELETE,
   TRUNCATE, REFERENCES, TRIGGER and MAINTAIN) on accounts, golfer_identities,
   personal_golfer_library, devices and account_providers. The source grants smaller
   browser privilege sets but never revokes pre-existing authenticated extras.
   RLS remains enabled with matching policies; [PostgreSQL documents that TRUNCATE
   is outside row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html). This is
   a confirmed least-privilege gap, not evidence that a browser has truncated data.
   A reviewed REVOKE/GRANT delta and role tests are needed; replaying .96 will not
   close it. No grant was changed in this audit.
10. **Cloud history boundary:** the July versioned/immutable tables and triggers
    are absent. Client checks preserve local frozen records, but do not prove the
    missing database history guarantees. The legacy matches member-update policy
    is broad. No claim is made that old rounds were changed or lost; row contents
    were not inspected. This requires a separate architecture/data rollout.

References: [PostgreSQL schemas and search paths](https://www.postgresql.org/docs/15/ddl-schemas.html),
[Supabase database-change broadcasts](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes).

## Proposed rollout order — no production action approved

1. Catalog comparison is complete. Retain this evidence and capture backups.
   Next run reviewed read-only data/integrity preflights before any DDL; this
   export does not establish row counts, backfills or duplicate-free data. Never
   edit/delete rows to make an old migration pass.
2. Ship the server-independent .77 client first. Both phones must visibly identify
   direct transport during the current missing-RPC state and a simulated cache lag.
   Confirm queue, account recovery and existing direct RLS behavior on real devices.
3. Identity/admission prerequisites are present. Rehearse host, joined guest,
   same-account devices and outsider behavior in staging using these actual RLS
   definitions. Resolve the direct-table authority decision before claiming
   database-enforced per-device scoring; installing the RPC alone leaves its bypass
   available. Do not blindly execute all 13 historical files.
4. Prepare and separately approve the minimal operation/receipt RPC rollout with
   its existing match revision mechanism. No Phase 2 per-cell/assignment revisions.
   Pair-aware client batching must already be live for 72/144/576 pending writes.
   Confirm every active scoring device has the new client before enabling the RPC;
   stale PWA clients still send oversized batches and rebuild retry payloads. If
   that cannot be confirmed, use a window without active shared rounds. Preserve
   local state during updates; do not force a reset to obtain version consistency.
5. Install transactionally in staging first; inspect function definitions, grants,
   RLS and receipt replay there. Rehearse PGRST202 cache lag, genuine non-PGRST202
   RPC failure and the non-destructive rollback before production approval.
6. On separately approved production deployment, request PostgREST schema reload,
   then verify the exposed RPC and actual limit. Schema reload can lag; direct mode
   must remain visible and covered. No fallback on arbitrary RPC authorization or
   logic errors. A mixed cache window must not lose earlier batch acknowledgements.
7. Verify a real two-phone round, final parity, freeze and Ledger. Retain receipts
   and diagnostics. The partial .75A constraints/indexes and absent July RoundRecord foundation
   get separate proposals. Tighten extra identity-table grants through a reviewed
   minimal change, not by rerunning migrations that only add GRANTs. These are not
   prerequisites for the existing score tables/RPC and must not be bundled silently.

### Rollback rehearsal requirements

Prefer a reviewed rollback that removes/disables only the failing score RPC and,
if necessary, its failing broadcast trigger; request schema reload. Keep all score
rows, memberships, shared_revision and operation receipts. Confirm clients report
direct mode and can retry preserved intent. A missing RPC selects fallback;
permission/logic errors in an installed RPC must not silently downgrade.

The existing .01 rollback drops shared_score_operations, destroying receipt/audit
history. It is a reference, not an acceptable live rollback unchanged. Likewise,
an identity rollback that drops live history or a catalog rollback that reopens
anonymous writes is not automatically safe. Capture old definitions and rehearse
compensating changes in staging; backups alone do not authorize data loss.

## What existing verification establishes

- npm test includes static migration/function assertions and browser API doubles;
  those prove repository expectations and client behavior, not deployed grants/RLS.
- stress-flamtana exercises scoring, settlement, hydration and report generation;
  it does not authenticate two real phones or execute production PostgreSQL.
- simulate:compare/test:simulations are local engine checks; the standing mirror
  still has no Flamtana implementation and does not test either cloud transport.
- Layout/PDF checks establish rendered output, not score-delivery guarantees.
- New suites explicitly distinguish DIRECT deployed-contract model from RPC
  repository-contract model. Neither label claims a live database policy test.

Thus some existing tests have been proving behavior production does not implement:
the operation RPC/receipt/hash/batch-limit path. The July cloud RoundRecord/version/immutability foundation is also absent despite
repository/static expectations. Conversely, the current course publishers, admission
and identity function bodies are deployed. Static schema tests and local frozen
reports did not establish those distinctions. Staging policy/runtime tests remain
required; the export completes catalog comparison, not end-to-end authorization.
