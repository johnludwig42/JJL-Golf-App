# v31.0.77 — Shared Match Delivery Reliability

Baseline: committed .76 (1c6968e), clean start. Branch:
codex/v31.0.77-shared-match-delivery. Owner authorization: October 20, 2026,
revised server-independent Phase 1 plus read-only audit of all 13 migrations.

## Scope and production finding

Production has no public.submit_shared_score_operations function, per John's two
SQL Editor checks. The previous 64-operation/hash rejection theory is not a
confirmed production cause. The deployed contract is the direct score_entries
fallback. No database object, policy or grant is changed by this release.

The score RPC implementation remains as a separately tested repository-contract
path. Its named 64-operation limit is tied to that source contract, not represented
as a deployed production finding. An empty, non-writing RPC probe distinguishes
PGRST202 before accessing a receipt table production may not have. Expected empty
batch validation identifies the RPC path; an advertised smaller limit is respected.
Future rollout still requires inspecting the deployed definition and permissions.

## Delivery behavior

- Remove the session-long permanent-failure Set. Retain every unacknowledged row
  and persist retry category, attempts, next eligible time, last success/progress
  under a per-match/originating-device key. Bounded exponential delay with jitter
  caps at 60 seconds. Reload and new scoring do not silently reset failures.
- Score delivery entry points check the same retry state and share an in-flight
  per-match delivery task. Genuine permission/assignment failures are visible and
  rechecked, not abandoned. Assignment changes and restored credentials permit
  reconsideration. Foreground triggers share session readiness; offline/hidden
  state preserves scoring locally without promising background execution.
- 401/PGRST301/PGRST303 on score delivery allow one coordinated forced refresh and
  retry. Failure retains the existing account/guest identity and shows recovery.
  Existing guest participation remains supported; a failed refresh never creates a
  substitute anonymous identity to get around authorization.
- Direct mode keeps current-row upsert semantics and one table request for its
  pending set, including 72/144/576 rows. It does not read a receipt table, apply
  RPC chunk limits or replay the immutable RPC snapshots. An HTTP table response
  acknowledges delivery only, not operation-ledger replay or card parity.
- Only PGRST202 selects direct fallback. Other RPC errors remain visible failures.
  Degraded transport is persisted in diagnostics and shown in sync/device status.
  A fallback during a partially acknowledged RPC upload retains earlier progress.
- RPC mode persists complete operation payloads before sending and retries them
  unchanged. Later corrections get new IDs. Batches stay below the contract limit,
  keep partner writes together, and acknowledge each batch before the next.
  Legacy attempted entries check same-user/device/match receipts before upgrade.
- Remove global 1,000-entry truncation. Failed enqueue retains an emergency intent
  on the working match; delivery stops if that intent cannot be staged durably.
  No unacknowledged operation is discarded to make room. This does not add archive
  storage or sparse statistics.
- Device status separates last successful contact, pending holes/writes, last
  acknowledgement, card parity and retry state. Remote status is last-reported;
  stale/missing reports show unknown/out of contact. Compact versioned presence
  JSON fits the admission RPCs' 500-character device_label budget without changing
  device identity. Diagnostics exclude assignment/player/account identifiers from
  retry summaries and contain no credentials or location history.
- Live-metadata read failure before upload was another weaker fallback. Its
  existing behavior is retained but now emits a diagnostic and Needs Attention.
- Empty outbox does not reconstruct missing cloud rows. Existing .76 reviewed
  Flamtana recovery remains the explicit remedy for that case; full-card repair is
  Phase 2. Pending partner integrity and parity/outbox completion gates remain.

## Audit and rollout

See docs/DEPLOYED_SCHEMA_AUDIT_v31.0.77.md and
scripts/check-shared-delivery-production.sql. The supplied production catalog export was compared against all 13 migrations:
10 cumulative effects present, 1 partial (.75A), 2 absent (July RoundRecord security
and August score reliability). All 12 deployed application function bodies and 28
RLS policies match their latest source definitions. Evidence and CSV hash are
retained under docs/audits/. The migration ledger contains only .93 and must not
be used to infer the other scripts are all absent.

The score receipt/revision/broadcast foundation is entirely absent. Installed
pgcrypto is in extensions and Realtime accepts record arguments, confirming the
old RPC migration needs corrections before rollout. Broad member-based score RLS
and extra identity-table grants remain separate findings. No SQL correction or
production change has been made. The absent July versioned-record foundation and
partial course constraints/indexes require separate proposals, not a blind replay.

Ship client observability before any separately approved RPC rollout. Staging must
rehearse cache lag/PGRST202, installed-RPC failures, mixed partial acknowledgement
and rollback. The historical .01 rollback drops the receipt table; do not apply it
unchanged after live use. Preserve scores, memberships, receipts and shared_revision.
No server-side per-cell/assignment revisions, CRDT, atomic team register, full-card
reconciliation, cloud archive or simulation-mirror Flamtana work is introduced.

## Constitutional review

See docs/architecture/CONSTITUTIONAL_REVIEW_v31.0.77.md. Existing host/scorer scope,
guest/account identity and frozen RoundRecords remain authoritative. No historical
record or settlement calculation changes; no production deployment authorization
is inferred from permission to prepare or audit.

## Verification

Client gates and deployed catalog audit complete; physical acceptance and
server staging/runtime tests remain pending.
Separate suites label DIRECT deployed-contract model and RPC
repository-contract model. Local API doubles do not prove production grants/RLS.
Gate results:

- Flamtana stress: 50/50; component settlements, payments and complete saved
  evidence byte-identical to the matching v31.0.62 policy-1 baseline. Page ranges:
  split 7–8 (13 runs), back-nine 7–8 (12), last-six 8–10 (12), hole-18 8–10 (13).
- Layout: 7/7 references pass, with 8/5/5/5/5/11/7 pages (46 total).
  Regenerated PDFs have identical extracted text and page counts to HEAD; metadata
  churn was discarded. No scoring/report-content changes.
- Lint: zero errors, 88 existing warnings. Validate: v31.0.77 passes.
- Release sanity: 6 PASS, 3 WARN, 0 FAIL. Warnings are dirty working tree and no
  explicit target for the optional build-note/asset checks. Validate independently
  verifies the current release metadata and assets.
- Simulation compare: 77 exact matches (27 fixtures + 50 random), 0 differences,
  0 failures, 62 warnings and 1 suspicious outcome. The suspicious item is the
  existing blowout fixture paying $111, above the harness $100 review threshold;
  it is not a live/mirror difference. Simulation tests: 4/4.
  These still do not cover Flamtana or live database permissions.

Final npm test: **1,481/1,481 passed, 0 failed, 0 cancelled, 0 skipped**
(947,656 ms). Dedicated delivery coverage included **30/30**: 13 DIRECT,
14 RPC/common and 3 browser checks. The third browser check verifies that local-only
wake never starts shared authentication. Focused local/shared wake and team-index
layout recheck: 4/4. The final full run was executed alone against the completed
client code, including all browser fixture corrections.

An earlier full run was 1,478/1,480 with no skips; saved-template and team-index
browser checks failed intermittently and passed isolated rechecks (3/3 and 1/1).
The saved-template test now waits for visible controls after reload. The team-index
test waits for settled touch-target sizes after media changes, retaining the 44px
requirement. The new wake handler is restricted to active shared rounds or queued
shared writes; local-only setup must not start authentication or cloud rendering.
A subsequent in-progress rerun was stopped after the repeated layout failure so
these corrections could be verified together in the final clean run above.

 Initial failures included
obsolete permanent-auth suppression and offline cloud-browser fixtures; corrected
checks retain the original completion/identity/score preservation assertions.
Storage pressure also exposed a retry-record write-failure edge: the working round
now holds a device-scoped recovery timer so failure cannot create a rapid retry loop.
A successful sign-in resets authentication backoff even with an empty outbox,
which still needs parity before completion.

Remaining acceptance: real two-phone
contact/acknowledgement/parity and sign-in/lock/reconnect checks, then separately
approved server rollout rehearsal. Local Chrome's simulated 18 lock/wake cycles
are API-model checks, not physical iPhone or production authorization tests.
Production RPC rollout remains blocked by the confirmed compatibility defects
and unverified role/runtime behavior. The client can be committed as a reviewed
development checkpoint; release acceptance still requires the real-phone checks. No commit, push,
migration or deployment performed.
