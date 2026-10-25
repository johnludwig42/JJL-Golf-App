# v31.0.81 — Ledger Acceptance Status

Approved narrow fix following staging verification on October 25, 2026.
Branch inspected clean: codex/shared-match-staging-verification.

The report adapter omitted `meta.status`, so a completed round with a saved Story
rendered final results but disabled Accept & Finalize. The adapter now copies
status from its authoritative effective RoundRecord. Existing final-status,
saved-Story and completed-match acceptance checks remain in place.

No scores, handicaps, settlement calculations, saved evidence or frozen records
are recalculated or modified by this adapter fix. No database migration.
Existing unaccepted rounds can reopen their Ledger without entering scores again.
Accepted historical reports retain their existing path.

New behavioral tests cover final/provisional metadata, round immutability, and
actual report acceptance with unchanged payments/evidence. Verification results
and the existing-round staging acceptance rehearsal will be recorded below.

## Verification

- Final full suite: 1,536/1,536 passed, zero failures/skips/cancellations,
  633.8 seconds. An earlier run was interrupted while correcting release asset
  version references; the final run above is the release result.
- New behavioral checks: 3/3 passed, including actual report renderer acceptance.
  The two model checks failed on missing status before the one-line fix.
- Existing saved staging host round reopened under .81 with its saved Story;
  Accept & Finalize succeeded, and Ledger finalized persisted after app reload.
  No score entry or Story regeneration. Printed document text matched the .80
  report exactly, at seven pages, including all component amounts and payments.
- Lint: zero errors, 88 existing warnings. Release validation passes.
- Layout: seven reference checks pass, with page counts 8/5/5/5/5/11/7
  (main, Nine Point, Sixes, Sixes Points, Wolf, iOS main, Flamtana).
- Flamtana stress: 50/50 passed (legacy policy 1 independent oracle). Pages:
  split 7–8 (13 runs), hole18 8–10 (13), back9 7–8 (12), last6 8–10 (12).
- Simulation comparison: 77/77 exact matches, zero failures/differences, 58
  advisory warnings and one synthetic blowout payment over $100 flagged for
  review. Simulation mirror still excludes Flamtana; stress coverage is separate.
- Simulation tests: 4/4 passed.
- Standard release sanity: 6 pass, 3 warnings (dirty tree, omitted optional target
  build-note/asset checks), zero failures. Validation separately checks .81 assets.
- Version-targeted sanity: 7 pass, 1 dirty-tree warning, 1 branch-name failure
  because the existing branch is codex/shared-match-staging-verification rather
  than the tool's hard-coded release/v31.0.81. No branch rename was made.

Broader shared-delivery, RPC rollout and physical two-phone verification remain
separate gates; this fix does not mark them ready. Staging Library also showed two
completed entries for the test shared code; logged without expanding this fix.
No production configuration, data or SQL changed. No commit/push/deployment.
Generated report and simulation outputs were checked, then left out of this
commit because the printed report did not change; existing references retained.
