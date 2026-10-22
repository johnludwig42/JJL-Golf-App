# v31.0.79 — Preserved Score Resolution

Baseline: committed v31.0.78 (`ec9f966`). Branch:
`codex/v31.0.79-preserved-score-resolution`. Owner approved the narrowed client-only
scope on October 21, 2026. The existing uncommitted amendment plan is retained under
`docs/PARKED_ROUND_AMENDMENTS_PROPOSAL.md`, with its parked status made explicit.

## Changes

- Scores awaiting review from the completion notice and round Library details;
  history remains available after cleanup and reload even without a saved marker.
- Review on the holding device only. Values are not uploaded for cross-phone review.
  Captured and later local values, frozen scores, source device and queued time are
  visible. Flamtana partners form one team/hole item covering all held operation IDs.
  Mismatched candidates require an explicit consistent review value; it never edits
  the frozen card. A team with only one held operation still displays both frozen
  partners rather than inventing a missing operation.
- Already reflected or Discard, individually or for an explicitly selected batch,
  with a reason and confirmation listing exactly the rows. No Accept control.
  Where per-hole statistics cannot be verified from a stat-tracked frozen record,
  Already reflected fails conservatively; Discard with an explanation remains available.
- A durable device-local IndexedDB receipt/audit commits before delivery copies are
  removed. Source values and identities remain auditable; identical local/captured
  values share one compact value and batch origin headers are deduplicated.
- Recovery after receipt, reference-save and cleanup interruptions is idempotent.
  Cleanup re-reads the global outbox after asynchronous work and synchronously checks
  unchanged evidence, preserving other rounds' writes and new review records.
- Only small receipt/key references remain in hot round state. Live outbox returns
  to its initialized empty size; separate audit bytes are displayed. History is
  retained, never silently capped. Device audit soft budget: 1 MiB serialized estimate;
  crossing it recommends export and does not prune history or block scoring.
- Published frozen-record parity is distinct from live-card parity. It requires
  matching fetched/local frozen content and available local audit evidence. A stored
  green flag cannot replace a missing audit. Discarded keys do not keep the remote
  stuck against the closed live ledger. No score_entries write is used to get green.
- Persistent non-blocking storage notice at 256 KiB delivery/review payloads or
  2 MiB total localStorage including backup keys; byte figures are UTF-16 estimates,
  not browser quota/headroom claims. Updates after normal outbox and state saves,
  including saves that skip the general render. No truncation or warning-based save block.
- Review history has a separate export. Existing round backups do not include this
  IndexedDB history; the UI says so. This is local exception audit, not a general
  archive/backup migration or authenticated host-approval workflow.

Frozen records/reports, rules, scoring, settlement and normal active-round parity
remain unchanged. Rounds with preserved/resolved exceptions stay read-only through
this workflow. No new SQL, cloud protocol or production database dependency.

The operational schema finding now has its own prominent document:
`docs/DEPLOYED_SCHEMA_OPERATIONAL_STATUS.md`. The all-13 audit and separately reviewed
RPC rollout remain unchanged gates for database work. No production SQL was run.

## Verification

Tests use behavioral engine models and real local Chrome IndexedDB; neither
substitutes for physical iPhone acceptance.

- Focused resolution, browser, direct-upload, RPC and completion suites: 55/55,
  zero skipped. Includes real IndexedDB transaction abort, reload recovery, quota
  failures, concurrent writes from another round, exact selections and partner pairs.
- Full suite final run: 1,508/1,509 passed, zero skipped/cancelled. One existing
  saved-setup navigation test timed out waiting 30 seconds for its landing selector.
  Its unchanged three-test file then passed 3/3 in isolation (2.9 seconds), and
  that test also passed in the first full run. The final full command still exited
  nonzero; this is not represented as a clean full-suite pass. No timeout was raised
  and no test was skipped or weakened.
- Lint: zero errors; 88 existing warnings.
- Validate: passed metadata, assets, syntax, worker lifecycle and documentation.
- Release sanity: 6 PASS, 3 WARN, 0 FAIL. Warnings are the uncommitted working tree
  and omitted target argument's build-note/app-shell checks; validate checks .79.
- Simulation comparison: 77/77 exact (27 fixtures + 50 random), zero differences
  or failures, 61 warnings and two suspicious outcomes. This mirror does not cover
  Flamtana; its independent stress suite remains required. Simulation tests: 4/4.
- Flamtana stress: 50/50, compared explicitly with retained .78 output. Every
  component's settlement money, combined payments and complete saved evidence
  remain byte-identical. Page counts match all 50 baseline rounds: split 7–8
  (13 rounds), back9 7–8 (12), last6 8–10 (12), hole18 8–10 (13).
- Layout: all seven references pass, retaining 8/5/5/5/5/11/7 pages. Extracted
  text and page counts of all seven regenerated PDFs match committed references;
  incidental PDF metadata churn was removed.
- At 375px width, the review dialog passes at 16px, 24px and 32px root text.
  Original frozen RoundRecord and accepted Ledger Entry data stay byte-identical
  after resolution; discarded differences can verify the published frozen record
  and leave the completed remote round without writing scores to the server.

The initial full run exposed a hidden-notice layout regression in the existing
foundation color test: applying the warning class to a hidden, empty notice could
override native hiding when component CSS was removed. The class now applies only
while a warning is shown. The unchanged foundation test plus all four new browser
tests then passed 26/26; the full suite was restarted on the corrected build.
The first run also caught new dialog colors outside semantic tokens and an
unnecessary important override. The dialog now uses existing semantic roles and
ordinary hidden-state specificity; the existing component checks pass 2/2 and pass
in the final full run. Initial full run: 1,506/1,509 (the foundation parent/child
failure and component guard). Final full run retains only the separate saved-setup
timeout described above. Final run duration: 682.2 seconds.

### Storage measurement (UTF-16 serialized estimates)

The deterministic 72-operation case measures the delivery outbox payload separately
from its durable review audit:

| Store / stage | Bytes |
|---|---:|
| Initialized empty delivery outbox | 126 |
| Delivery outbox holding 72 preserved operations | 164,572 |
| Delivery outbox after resolution | 126 |
| Separate retained audit receipt | 63,394 |

The audit figure excludes IndexedDB implementation overhead. Small receipt/key
references remain in round state and its normal backup; these are not represented
as zero-growth total storage. No quota/headroom claim is made.

## Manual acceptance after client publication

1. Install .79 on both devices and verify Support version/cache. Use a disposable
   shared round; ordinary scoring, saving, lock/wake and reconnect must still work.
2. Preserve a remote score at host completion. On that phone open Scores awaiting
   review from the notice and from Library. Confirm values/time/device and both team
   partners; captured/later differences must both show. Check at larger text size.
3. Review with the host on the holding phone. Exercise a selected Already reflected
   batch and a selected Discard batch, with reasons. Confirm the immutable scorecard,
   settlement and original Ledger Entry remain unchanged.
4. Reload and reopen the round. Pending payloads should be gone only for resolved
   rows; local decision history and original facts remain available. Export the audit
   separately. Sign-in failure may prevent cloud verification but must not lose local
   decisions or turn resolution into a repeated score upload.
5. Reconnect and check the frozen record. A valid match should verify independently
   of a differing discarded local score; the remote should be able to leave the
   completed round. A mismatched/unknown record must stay unconfirmed.
6. Storage warnings are estimates, not a request to clear data. Quota/transaction
   failure is covered by automated injection; do not clear real browser storage to test it.

No commit, push, deployment or production SQL performed. Physical acceptance remains
for the owner after publication.

## Confidence and limitations

No unresolved failure was reproduced in the new resolution, recovery, storage or
transport behavior. The intermittent saved-setup navigation timeout is not proven
eliminated; the full gate remains nonzero despite its isolated pass. Physical iPhone
IndexedDB/lock-wake acceptance is still pending. These tests do not verify the
separately proposed production RPC, deployed RLS, or a cloud amendment system.
