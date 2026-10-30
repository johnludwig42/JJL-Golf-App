# v31.0.84 — Assigned Device Reconciliation

Owner approved client-only correction of both gates identified by the controlled
staging failure. Existing uncommitted staging tooling/audit notes are preserved.
No production execution, SQL, RPC rollout, settlement or report-content changes.

## Change and constitutional review

Assigned-player ownership no longer rejects all canonical rows. Reconciliation
checks cell-level pending outbox/recovery intent, and protects both Flamtana
partners when either has a queued write. Unreadable queue storage and failed
delivery persistence fail closed. The assigned pair preflights both authority and
timestamps before either partner changes. Canonical inconsistent pairs still
propagate as Pending rather than being silently resolved. Regular independent
player scores retain cell-level rather than team-level protection.

resolveSharedScoreWrite explicitly recognizes the host participant as authorized
across assignments, while retaining timestamp checks and rejecting unrelated
participants or a claimed host participant with a conflicting device. Captured
local intent and immutable retry payloads remain unchanged. Frozen RoundRecords
are not reconciled or recalculated. No authentication or server authority change.

Principles 2/5/6: existing host authority and assigned scorer intent are preserved;
authoritative server facts may reconcile after acknowledgement. Principles
8/10/11/22: frozen facts, settlements and historical versions remain intact. This
does not add amendments or loosen RLS. No constitutional conflict identified.

## Attribution verified before implementation

Actual retained DYE-682947 score rows and shared participant metadata were read
through the staging SDK. Each score account matches both the organizer and scorer
participants. The existing resolver therefore returns an empty participant in this
same-account round: the second gate was moot here. Different-account and explicit
host tests cover that second gate permanently rather than relying on ambiguity.
Evidence: tmp/report-qa/shared-staging/v84-pre-fix-canonical-attribution.json.

## Verification

New permanent tests run two independent engine instances in assigned scoring mode:
direct and RPC models, same/different accounts, host takeover and canonical merge
in both directions. Additional regressions cover one pending partner, newer local
acknowledged intent, stale/partial/unauthorized pairs, canonical Pending, storage
recovery/corruption, reload/backoff, regular non-owned players and frozen facts.
The initial pre-fix run failed 10/12 cases, reproducing the merge seam defect.
Current new seam tests: 13/13 PASS. New seam plus staging tooling: 29/29 PASS.

Older assertions that deliberately treated the legitimate host as unauthorized
were updated with comments: unauthorized cases use an unrelated participant;
the old stale-write case now supplies an actually stale host timestamp. Host
authority and unauthorized-source behavior are both positively tested.

Acceptance exposed another interaction in this scope: an untouched stale DOM
score could be requeued when navigating after a canonical update. Two browser
regressions reproduced this before the fix. Generated team and individual score
inputs now track fresh input/stepper intent, clear that marker after collection,
and do not recreate an assigned-device write from untouched display text. Explicit
typing, +/- and clearing remain supported. Seam + new/existing team-input browser
checks: 17/17 PASS. No scoring or settlement calculation changed.

| Gate | Actual result |
| --- | --- |
| npm test | Final rerun 1,595/1,595 PASS, 0 failed/skipped; 694,740.6265 ms |
| npm run lint | 0 errors, 88 existing warnings |
| npm run validate | PASS |
| npm run check:layout | All 7 layouts PASS; final command stopped writing the iOS reference PDF, then iOS and Flamtana checks passed to temporary PDFs; Flamtana 7 pages |
| npm run release:sanity | 6 PASS, 3 WARN, 0 FAIL (untargeted) |
| npm run release:sanity -- v31.0.84 | 7 PASS, 1 WARN, 1 FAIL: branch is codex/shared-match-staging-verification rather than release/v31.0.84 |
| npm run simulate:compare | 77/77 exact, 0 differences/failures; 60 warnings, 1 suspicious outcome |
| npm run test:simulations | 4/4 PASS, zero skipped |
| node scripts/stress-flamtana.mjs | Final run 50/50 PASS |

Simulation mirror still does not include Flamtana; its stress and assigned-device
regressions provide separate coverage. Current-version literals in comments added
to old tests initially tripped release identity assertions; corrected comments,
then identity 14/14 PASS and the complete pre-DOM suite passed. Final suite rerun
includes the two new browser regressions. Gate logs: ignored
tmp/report-qa/shared-staging/v84-*.log. Generated report references are verification
outputs, not intentional report-content changes.
Final layout rerun initially needed permission for its local browser connection.
After that, five layouts passed in the command; the iOS layout assertions ran but
writing its standard PDF returned an OS open error. Repeating iOS to a temporary
output passed (11 pages), then Flamtana passed (7 pages). No layout was skipped.
Test-generated report files were restored to their initially clean committed
content. This release intentionally does not regenerate frozen references.

Final retained DYE-682947 acceptance on build 2026-10-30T10:30:00Z: host queued all
72 paired operations for four teams on holes 1–9 (gross 4/5/6/7). Actual staging
direct-table POST72 returned HTTP200; both assigned devices showed Confirmed
parity and pending0. Remote navigation/Save did not replay untouched older scores.
The 18-hole round completed, remote returned to Match, verified facts-only Story
saved, seven-page Ledger accepted/frozen. Story service was unavailable; no claim
of AI-service verification. A locally injected PGRST202 exercised actual table
delivery/RLS; staging RPC remains installed, so this is not a natural cache-lag test.
All review faults/transport override cleared afterward. Original accepted report
retained. See docs/audits/v31.0.84-assigned-device-reconciliation.md for evidence,
actual attribution, known limits and the proposed bounded matrix termination rule.

Physical two-phone acceptance is NOT_RUN: owner confirmed no phone-accessible
staging website exists. Both current previews are loopback-only. Prepare the
phone checklist, but do not publish a build, expose a server or mark that gate
passed without a separate authorized staging delivery and actual device results.
