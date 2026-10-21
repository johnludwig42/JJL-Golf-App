# Shared score delivery and completion protection — REVIEW ONLY

Baseline: committed v31.0.77, `91eac02`. Branch: `codex/shared-score-rpc-rollout-review`.
Nothing has been run against production. SQL lives outside `supabase/migrations`.
**Do not run the historical RPC migration or paste this proposal into production.**

## Owner-approved scope

The compatibility corrections qualify `extensions.digest` and adapt the notification
to the installed eight-argument RECORD signature, with match_id-only metadata.
The owner additionally approved completion protection on both delivery paths and a
drainable client outcome. This is not the deferred per-cell revision/full-card repair work.

The deployed catalog audit covers all 13 migrations: 10 applied cumulatively,
1 partially applied, 2 absent. See `docs/DEPLOYED_SCHEMA_AUDIT_v31.0.77.md` and its
captured evidence. Catalog inspection is complete; live service verification is not.

## Completion contract

- `P7701` means **HOST_COMPLETED_WITH_LOCAL_SCORES**, identically on RPC and direct
  table writes. It is a closed-round outcome, never a transient/auth/retry category.
- A common BEFORE trigger locks the parent match and prevents changed INSERT,
  UPDATE and DELETE operations after completion/freeze. It checks both parent IDs
  on identity changes. A concurrent completion and score delivery serialize on the
  parent row; a write waiting behind completed finalization is refused.
- Only `updated_at` and `updated_by` are excluded from value equality. Every other
  column, including identity, statistics, entry_status and unknown future columns,
  participates. Identical closed retries return without changing scores, timestamps
  or broadcasts. Missing closed rows are genuine late writes and are refused.
- A one-way `shared_scores_closed` latch is initialized for existing closed/frozen
  matches and stays true even if a stale metadata upsert sends status=active or
  explicitly sends false. This protects score delivery from the deployed broad
  metadata policy. It is derived delivery metadata, not a rewritten RoundRecord.
- RPC receipt replays return their original acknowledgements, even if a later valid
  correction changed the cell. They perform no score write. A new-ID identical
  closed retry returns a no-op acknowledgement at the current revision (possibly
  zero for pre-migration direct rows), without inventing a new ledger receipt or
  incrementing revision. Direct delivery has no operation ledger; identical values
  still pass as no-ops. This explicitly handles the lost-acknowledgement asymmetry.

## Client review patch and preservation

`client-completion-review.patch` is the tested draft against 91eac02, not an applied
release. Promote it in a separately versioned client release before server rollout;
update cache/branding/build notes and repeat release gates then. It includes tests.

On P7701 the client atomically moves current pending operations into a
`preservedForHostReview` collection in the existing outbox envelope. One durable
write retains complete queued payloads, latest local score values, operation/device
IDs and the reason before those operations leave the pending queue. Failed storage
leaves pending operations intact with a storage warning. Review evidence survives
reload and subsequent queue/ack writes, and is scoped by match. It is **local to the
originating device**; the host sees the reported exception count, not a new cloud
archive or an automatic amendment. Keep that device available for host review.

`remoteCompletionPending` and HOST_COMPLETED_WITH_LOCAL_SCORES carry the warning.
Delivery displays **complete with exceptions**, pending=0, without claiming score
acknowledgement or parity. Counts survive reload even without the mutable marker.
Compact per-device telemetry reports preserved counts without golfer/score details;
stale remote reports still show unknown/out of contact. Visible unsaved fields and
local/frozen conflicts retain their existing protection.

A rejected multi-row statement is atomic. The conservative client preserves all
remaining unacknowledged operations for that now-closed match, including unattempted
batches and a correction queued while the response arrives. It does not guess which
rows were equal, or mark them accepted. Already acknowledged earlier batches stay
acknowledged. Identical-only server retries succeed normally without exceptions.

The pre-outbox initial direct seed also handles P7701 through the same preservation
path. No score is silently dropped and no closed rejection enters permanent backoff.
Review evidence must be exported/reviewed before downgrading to an older client,
whose old outbox writer does not understand the additive review collection.

## Rollout dependency — mandatory order

1. Ship committed **v31.0.77** first: honest device contact/pending/ack/parity indicators,
   bounded durable retries, and visible RPC/direct transport. Permanent direct-upload
   coverage is already in place: **13/13 tests** at the committed baseline.
2. Ship a new versioned client containing the reviewed closure patch to every
   participating device. Verify complete-with-exceptions, durable preservation,
   storage recovery and the host's reported pending/exception counts on two phones.
3. Recheck all 13 migration findings against a fresh deployed catalog; complete the
   Supabase staging/service gates below. Obtain separate production approval.
4. Only then install the corrected RPC and common completion guard. Cache reload
   may temporarily select direct mode; its closure semantics remain identical.

Without step 1 a host could close while an unseen remote has unsent holes. Without
step 2 the distinct server rejection would be stranded in the old retry coordinator.
Neither client readiness nor SQL safety is proved by merely committing these files.

## Installation, rollback and restore

All three SQL scripts require an explicit operator review setting and postgres;
a plain paste/run refuses before DDL. The setting is an accident guard, not a
security boundary. Installation refuses existing/partial objects instead of
replacing unknown production state. RPC retains the real 64-operation ceiling.

`rollback-review.sql` removes the exposed RPC and detaches the notification trigger,
retaining scores, receipts, memberships, revision, the closed latch and **both
completion triggers**. Direct fallback remains protected. Rollback is not permission
to reopen a round. `restore-review.sql` restores the same corrected RPC/notification
against retained history. The historical rollback drops receipt history and must
not be substituted. Both procedures request PostgREST cache reload; actual API
responses must be checked before claiming recovery, since a stale cache can return
an error other than PGRST202 while the function disappears.

## Local verification

See `LOCAL_REHEARSAL_RESULTS.json` and `VERIFICATION.md` for actual counts and limits.
The disposable PostgreSQL 18.4 fixture uses copied audited table types, constraints,
RLS and membership helpers, with synthetic accounts and substitutes for auth.uid
and the observed Realtime RECORD interface. It is not a Supabase service test.
SQL fixtures abort outside database dye_rpc_review at 127.0.0.1:55477. The local
server is stopped after rehearsal; test data/logs remain under ignored tmp/.

## Supabase staging gate — NOT RUN

A separate test project is required; none is configured here.

1. Real host/joined/guest/outsider sessions, including two devices using the same
   account. Local SQL uses distinct synthetic host/scorer accounts.
2. Actual pgcrypto, broadcast function implementation and private Realtime delivery.
3. SDK/PostgREST 72/144/576 writes, pair-aware batches, lost responses, refresh and
   assignment changes. Identical retries after completion, late changed rows and
   both orderings of score/finalization concurrency, including partial batch progress.
4. PGRST202 cache lag visibly selects direct delivery; non-PGRST202 never silently
   downgrades. Closed errors must use P7701 in real PostgREST responses on both paths.
5. Rehearse rollback/cache reload/restore without losing scores or receipt history,
   including direct identical replay and rejected late correction while rolled back.
6. Physical two-phone round through parity, freeze, Story and Ledger, plus storage
   failure/reload with preserved exceptions. Confirm all active devices have the
   closure-aware client before allowing server protection into production.

The absent July versioned-history foundation, partial course constraints/indexes,
identity-table over-grants, broad direct membership authority and broader metadata
immutability remain separately documented audit findings. A score-delivery barrier
is not a claim that the absent cloud versioned RoundRecord architecture is deployed.
No production approval is requested yet.
