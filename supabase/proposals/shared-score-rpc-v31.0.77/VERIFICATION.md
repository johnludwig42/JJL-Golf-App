# Review proposal verification — October 20, 2026

This report covers local rehearsal of the proposed server contract and client patch
against committed v31.0.77 (91eac02). No production execution or release deployment.

| Check | Actual result |
|---|---|
| Full regression run with draft applied | 1,486/1,486; 0 failed/skipped; 597,415 ms |
| Final focused client/browser tests | 41/41, 0 failed/skipped: 8 new closure cases, 13 permanent direct-path cases, 14 RPC/common cases, 6 completion browser cases |
| Lint | 0 errors, 88 existing warnings |
| Validate | PASS; committed .77 release identity remains intact; this is not a new release |
| Layout | 7/7 references, pages 8 / 5 / 5 / 5 / 5 / 11 / 7 (46 total) |
| Release sanity | 6 PASS, 3 WARN, 0 FAIL; warnings: dirty review work, no explicit release-note target, no explicit asset target |
| Compare simulation | 77/77 exact, 0 differences/failures, 62 warnings, 1 pre-existing suspicious-outcome threshold; Flamtana is still absent from the mirror |
| Simulation tests | 4/4, 0 failed/skipped |
| Flamtana stress | 50/50; component money, payments and complete saved evidence byte-identical to retained .77 baseline previously verified against .62 |
| Local SQL contract | 51/51 |
| SQL rollback/restore | 17/17 |
| SQL authorization/existing-schema refusal | 4/4 |
| Completion concurrency | 3/3: both transports wait for host closure and reject late changes; stored score remains unchanged |
| SQL total | 75/75, PostgreSQL 18.4 synthetic localhost database; server stopped |
| Supabase service/staging / physical two-phone acceptance | NOT RUN; no configured staging project or live database connection |

Stress page ranges: split 7–8 (13 rounds), hole18 8–10 (13), back9 7–8 (12),
last6 8–10 (12). The stress command used its default ignored v62 output directory;
comparison used the independently retained v77 directory, not the newly generated
v62 files. All 50 game-money, payment and evidence serializations matched. No engine
or report rendering source was changed by this proposal.

The full regression run began before the last focused closure refinements and new
assertions were finalized. The final 41-test focused run covers those final changes.
This combination is local proposal evidence, not the final gate for a future release:
when promoting the patch, assign a new version/cache and rerun the complete gates
on that immutable build. Generated PDF/date/simulation-output churn was reviewed
and removed; reference report contents and page counts stay unchanged.

The existing permanent direct suite is tests/v31.0.77-direct-score-delivery.test.js.
It distinguishes current-row table upserts from immutable RPC payloads, has no fake
operation ledger on the direct path, exercises 72/144/576 uploads, lost response,
auth refresh/failure, RLS denial/retry and no fallback for non-PGRST202 errors.
Direct coverage remains required during every schema-cache deployment window.

The new patch adds RPC/direct P7701 preservation, reload without the working marker,
read-only closed scores, parity not inferred from stale primary state, compact reported exception count, storage-failure retention,
match isolation, new correction during response, known-completion without auth and
partial acknowledgement followed by closure. Browser cases include a queued score
and an unsaved visible score arriving at completion together. The old browser
assertion that queued scores stay permanently pending was deliberately replaced:
only durable review preservation permits removal; a failed save keeps them queued.

SQL includes closed changed/missing scores, stats/deletes, identical INSERT/upsert
and UPDATE, membership on identical no-op, receipt replay, revision-zero legacy
rows, no new receipts/revisions/broadcasts on closed no-ops, frozen snapshot closure,
a one-way closure flag despite stale active metadata, retained guard during rollback,
restored old receipts and bounded 72/144/576 delivery. Actual Supabase auth.uid and
Realtime implementation are substitutes locally, not claimed production-verified.

Remaining confidence limits: real PostgREST P7701 mapping, schema-cache reload and
rollback behavior, actual Realtime broadcasts, same-account two-phone sessions and
event-round completion must pass staging/physical acceptance. The separate catalog
audit's missing versioned-history foundation, broad direct authority and over-grants
remain open. Score protection is not a claim that those missing controls exist.

Review files remain outside migrations. Client patch is unapplied after local
rehearsal. No commit, push, release or production change was performed.

Final focused run: 41/41 in 32,420 ms after the last patch refinement. An earlier
reload assertion called a non-exported test helper; it was corrected to the existing
scoring-access export and rerun successfully. The patch passed reverse/apply checks,
and app.js plus the existing browser test match committed 91eac02 afterward.
