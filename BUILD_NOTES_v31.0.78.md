# v31.0.78 — Closed-Round Score Preservation

Baseline: clean 3e5a7a0 (review package), with client v31.0.77 at 91eac02.
Branch: codex/v31.0.78-closed-round-score-preservation.
Owner approved preparing the reviewed client patch as the next release.

## Behavior

Both RPC and direct score delivery treat P7701 as a closed-round outcome under
HOST_COMPLETED_WITH_LOCAL_SCORES / remoteCompletionPending. Pending operations move
atomically into preservedForHostReview in the existing outbox envelope before they
leave the pending queue. Complete queued payloads, latest local score values,
operation/device IDs and reason are retained. Failed storage keeps them pending.

Delivery displays complete-with-exceptions, never claims these scores were accepted,
and does not retry them indefinitely. Prior acknowledged batches remain acknowledged;
all remaining unconfirmed operations are conservatively preserved, including a
correction queued while the rejection arrives. Known remote completion also uses
this path without contacting authentication or the server again.

Evidence survives reload and subsequent outbox writes. Closed scores stay read-only
even if a crash left the working match marker unsaved; stale primary parity cannot
count as verification. Device telemetry reports the exception count without score
details. Unsaved visible fields and local/frozen differences retain their protection.
The legacy direct initial-seed path handles the same closed-round code.

Review evidence stays on the originating device: keep that device available for
host review. This is not a cloud archive, automatic score amendment or new review
workflow. Do not downgrade that device before its preserved evidence is reviewed
or exported; older outbox writers do not retain the additive review collection.

## Scope and rollout

Applies the reviewed client patch; scoring, wagers, settlement, saved evidence and
frozen RoundRecords remain unchanged. Updates release identity/cache, immutable
branding assets and the five recent in-app release notes. No database migration.

Install v31.0.78 on every participating device before any separately approved server
completion guard. The deployed schema audit remains a gate: 10 migrations applied
cumulatively, 1 partial, 2 absent. Server SQL remains review-only outside migrations;
staging auth, PostgREST/cache, Realtime and physical two-phone acceptance are pending.
The current production server does not yet emit the proposed P7701 protection.

## Verification

- Focused delivery/browser checks: **41/41**, 0 failed/skipped (29,910 ms).
  Includes 8 closure cases, 13 permanent direct-upload cases, 14 RPC/common cases
  and 6 end-of-round browser cases. Queued and unsaved visible entries are tested
  together; the earlier permanent-pending expectation is deliberately replaced by
  durable preservation followed by a drained delivery outcome.
- Flamtana stress: **50/50**. Every component amount, payment and complete saved
  evidence serialization matches retained v31.0.77 output previously verified
  against v31.0.62. Output: tmp/report-qa/v78/stress; baseline: tmp/report-qa/v77/stress.
  Pages: split 7–8 (13), hole18 8–10 (13), back9 7–8 (12), last6 8–10 (12).
- Layout: **7/7**, pages **8 / 5 / 5 / 5 / 5 / 11 / 7**, 46 total. Regenerated PDF
  extracted text and page counts match HEAD exactly; PDF churn is discarded.
  Reference HTML asset queries and Flamtana fixture appVersion advance to .78.
- Lint: **0 errors, 88 existing warnings**. Validate: v31.0.78 passes.
- Release sanity (standard command): **6 PASS, 3 WARN, 0 FAIL**. Warnings: dirty
  review work and no explicit optional build-note/asset target. Validate checks
  those release assets and documentation independently. An additional target-mode
  run returned 7 PASS, 1 WARN, 1 FAIL because its hard-coded branch check expects
  release/v31.0.78 rather than the codex development branch; no application check
  failed and no checker was weakened to conceal this naming limitation.
- Simulation comparison: **77/77 exact**, 0 differences/failures, 60 warnings,
  1 suspicious outcome (existing blowout fixture threshold). Simulation tests:
  **4/4**, 0 failed/skipped. The simulation mirror still does not exercise Flamtana;
  the independent 50-round harness does. No coverage expansion is included.
- Full npm test: **1,489/1,489**, 0 failed, 0 cancelled, 0 skipped
  (**588,909 ms**). Ran alone against the completed versioned client after the
  other browser gates. All 8 new closure tests are included in this full run.

## Self-review and remaining acceptance

The application delta is the approved review patch plus release metadata. Queued
operations are removed only on acknowledgement or atomic preservation, with no
server-call retry for known closed outcomes. Neither acknowledgement time nor
parity is fabricated. A stale primary parity flag after a crash does not override
review evidence. Snapshot scoring, wager engines and report rendering logic do not
change. Normal open-round direct delivery remains permanently covered separately
from the RPC model; production RPC deployment is not implied by passing those tests.

Physical iPhone acceptance is not executable from this workspace. After publication,
install .78 on both phones and verify these on a disposable round:

1. Confirm .78 in Support on host and remote, using the intended accounts; include
   the same-account configuration used in John's rehearsal.
2. Score/save on both devices, lock/wake and reconnect. Confirm contact, pending
   scores, acknowledgements and parity remain separate and scores reach the host.
3. With a saved remote change awaiting delivery, have the host complete its known
   scorecard, then reconnect the remote. Expect complete-with-exceptions, zero
   pending delivery, retained local values for host review and read-only scores.
   Keep that phone available; its exception count is not a cloud copy of the scores.
4. Reload the remote. Confirm the warning and values survive and Sync Now does not
   loop or imply those exceptions changed the frozen host result. Reopen the host's
   frozen Ledger and verify its settlement is unchanged.
5. Repeat with an unsaved visible entry as the completion notice arrives. The input
   must remain captured for review. Storage-full recovery has automated quota-failure
   coverage; do not clear browser data or real rounds to rehearse this manually.

Actual P7701 responses, Supabase cache/Realtime behavior and rollback require the
separate staging rehearsal before any production SQL. No commit, push, deployment
or production SQL performed.
