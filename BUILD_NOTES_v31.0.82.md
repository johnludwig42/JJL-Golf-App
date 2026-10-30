# v31.0.82 — Shared Host Takeover Handoff

Approved fix for a host takeover permanently blocking a later assigned scorer's
correction, affecting shared merge logic on direct and RPC transports.

Active override protection retires during authoritative score pull only when no
partner has pending writes, the queue is readable, and a complete equal server
pair passes authority and timestamp checks. Takeover history remains separate.
Pending/newer host edits, stale/unauthorized incoming scores, partial pairs and
storage failures retain protection. Legacy unfinished rounds reconcile in place.
Completed/frozen rounds are excluded from this lifecycle change. No server SQL,
handicap, scoring, settlement or saved evidence calculation changes.

## Constitutional review

Principles 2/5/6: existing scorer assignments and administrator identity unchanged;
canonical cloud reconciliation resumes after outstanding host edits resolve.
Principles 8/10/11/22: changes only unfinished working-copy protection; completed
RoundRecords, accepted settlements and prior historical facts are not rewritten.
No amendment session or access expansion introduced. No constitutional conflict.

## Verification

New behavioral tests cover direct/RPC hand-back, canonical echo, old acknowledgement
versus newer host edit, partial acknowledgement/missing/unequal partner, stale and
wrong-source rows, storage-failure flag, unfinished reload and frozen facts.
Actual results:

- npm test: 1,551/1,551 PASS, zero failures/skips (721.7 seconds).
- lint: zero errors, 88 pre-existing warnings. validate: PASS.
- check:layout: all seven reference reports PASS, Flamtana seven pages.
- release:sanity: 6 PASS, 3 WARN, zero FAIL using the standard command. Additional
  targeted v31.0.82 invocation: 7 PASS, 1 WARN, 1 FAIL solely because this work is
  on codex/shared-match-staging-verification rather than release/v31.0.82. The
  branch was intentionally not changed. Working tree remains uncommitted.
- simulate:compare: 77 rounds, 77 exact live/mirror matches, zero differences or
  failures; 58 warnings and one suspicious outcome reported by the existing gate.
  This mirror still does not cover Flamtana. test:simulations: 4/4 PASS.
- scripts/stress-flamtana.mjs: 50/50 PASS using its default legacy policy.
  Current off-low scoring and immutable frozen evidence also pass full-suite tests.
- Browser suites initially hit restricted localhost socket errors; the full suite,
  layout and stress were rerun with localhost access. No failing restricted run
  is presented as a completed successful test.

Retained actual staging DYE-682947 recovered in place after normal Install Update
to v31.0.82 and Retry Sync: T3 host gross 6/net 5 became saved remote gross 8/net 7,
without score entry or match recreation. Diagnostics show confirmed parity, zero
conflicts/missing entries/pending writes; score survived reload. Both isolated tabs
updated with data retained. Original accepted DYE-119214 still shows Ledger finalized.
Evidence: tmp/report-qa/shared-staging/v82-recovered-host.png and
v82-recovered-host-diagnostics.txt. No browser hidden-state edits used.

Staging remains rolled back, so actual hosted RPC re-verification after Restore,
rolled-back closure checks, private Realtime, outsider HTTP sessions, controlled
failure/race matrix and physical-phone checks remain open. Unit transport coverage
is not claimed as hosted RPC or phone proof. No production deployment or SQL.
Generated reference reports were restored after verification; no report polish.
