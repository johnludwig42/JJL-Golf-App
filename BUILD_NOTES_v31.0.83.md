# v31.0.83 — Shared Score Snapshot Reliability

Approved narrow client fix for scores entered while shared delivery is awaiting
authentication or RPC availability. A direct-mode operation previously omitted its
score snapshot. If RPC became available, preparation could attach an older caller
snapshot to the newer operation, acknowledge blank/zero rows, and empty the queue.
The retained reproduction sent two zeroes while both local partner scores were 7.
This reproduces the observed symptom; it does not prove the historical T4 incident
had the same cause.

Every new operation now captures score/stat intent when queued, regardless of the
last observed transport. Direct upload continues to send current saved rows.
Snapshotless legacy entries are upgraded durably from the current canonical match
after awaited session/receipt checks. Existing immutable payloads and operation IDs
remain unchanged; previously attempted legacy operations still check receipts first.
Captured null/empty/absent gross scores remain null, rather than becoming zero.
Acknowledgements remove only their own operations, preserving later corrections.

## Constitutional review

Principles 2/5/6: existing account, device and assignment checks remain required;
queued intent is captured before delivery rather than inferred from stale state.
Principles 8/10/11/22: completed RoundRecords, frozen evidence and settlements are
unchanged. No amendment capability, authority expansion or server SQL is introduced.
No constitutional conflict identified.

## Verification

Focused live-engine transport tests: 13/13 PASS. The pre-fix suite reproduced the
stale zero-score payload and missing direct-mode snapshots. A test-helper default
initially masked the undefined-score case; corrected before the passing run.
Coverage includes probe interleaving, legacy upgrades/receipt lookup, immutable
lost-response replay, correction during receipt lookup or delivery, blank values
and storage-failure queue retention, reload and canonical working-copy replacement.
Release gate results:

- npm test: 1,564/1,564 PASS, zero failures/skips (707.1 seconds).
- Final focused delivery/host-handoff rerun: 47/47 PASS, including all 13 new
  regressions. Final review added canonical storage-recovery cleanup only after
  the upgraded outbox is durably written; its reproduction failed before cleanup.
- lint: zero errors, 88 pre-existing warnings. validate: PASS.
- check:layout: 7/7 reference reports PASS; Flamtana remains 7 pages.
- release:sanity: 6 PASS, 3 WARN, zero FAIL with the standard command. Explicit
  v31.0.83 check: 7 PASS, 1 WARN, 1 FAIL solely because the existing working branch
  is codex/shared-match-staging-verification instead of release/v31.0.83.
- simulate:compare: 77/77 exact live/mirror matches, zero differences/failures,
  54 warnings and one suspicious outcome reported. This mirror excludes Flamtana.
- test:simulations: 4/4 PASS.
- stress-flamtana.mjs: 50/50 PASS, default legacy policy; current off-low rules are
  also exercised in the full suite. No settlement calculation source was changed.
  Printed page ranges: split 7–8 (13 rounds), back9 7–8 (12), last6 8–10 (12),
  hole18 8–10 (13). Generated reference reports/simulation summary were restored
  after verification; no report content or settlement fixture changes are included.

Actual staging smoke: both isolated browser origins updated through Install Update
to v31.0.83, retaining active DYE-682947 and its first two scored holes. Host saved
T1/T2 gross 4/5 and remote saved T3/T4 gross 6/7 on hole 3 through normal Play UI.
Both cards showed net 4/4/5/6, Operation receipts, zero pending and confirmed parity,
without reviewed resend. Scores survived reload. This is an ordinary hosted RPC
smoke; the controlled interleaving above is a mocked-transport reproduction, not an
injected hosted network race. Accepted original Ledger tab was retained unchanged.
Screenshot: tmp/report-qa/shared-staging/v83-host-hole3.png.

Production remains unchanged and unapproved. Mocked transport tests are not proof
of hosted RPC delivery, private Realtime or physical-phone acceptance. Existing
empty-queue/missing-cloud-score cases continue to require reviewed resend; this
prevention fix does not silently repair or reinterpret historical cloud data.
