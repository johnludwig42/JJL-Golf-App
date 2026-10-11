# v31.0.69 — Pre-event verification and feature freeze

**Verified October 11, 2026. Application build: committed v31.0.68, `9a8459e`.**
Started with a clean tree on codex/v31.0.68-local-storage-footprint; verification
branch is codex/v31.0.69-pre-event-verification. The application version, cache,
scoring engine, persistence, frozen records and report implementation remain .68.
This is a documentation/verification delivery, not a new application build.

**Outcome:** all automated release gates passed. The complete local two-device
application flow and 50 stress scenarios retain .62's settlement amounts. Large
saved-state compaction preserves historical facts and actual statistics. One
misleading Support diagnostic was confirmed and reported before any fix; it is
left unchanged. Actual iPhone/live-service acceptance is still required.

## 1. Final-build gates — actual results

| Gate | Result on unchanged .68 |
| --- | --- |
| `npm test` | **1,400 passed / 1,400; 0 failed, 0 skipped, 0 cancelled.** Duration 466,553 ms |
| `npm run lint` | **0 errors, 88 warnings**; existing equality-style warnings |
| `npm run validate` | **1 release-validation pass** covering metadata, assets, syntax, worker lifecycle and required documentation |
| `npm run check:layout` | **7/7 layouts passed**, 46 physical pages total; counts listed below |
| `npm run release:sanity` | **6 PASS, 3 WARN, 0 FAIL** |
| `npm run simulate:compare` | **77/77 exact matches**: 27 fixtures + 50 random rounds; **0 differences, 0 failures**, 60 advisory warnings, 1 suspicious outcome |
| `npm run test:simulations` | **4/4 passed; 0 failed, 0 skipped** |
| `scripts/stress-flamtana.mjs` | **50/50 passed**, seed 620050; comparison baseline **v31.0.62**, not .67 or .68 |

No requested gate or test was skipped. The three release-sanity warnings are the
working tree's generated verification outputs, omitted build-note target argument,
and consequently unavailable shell-asset version target. Validate independently
passed the final .68 identity and shell assets. Generated timestamp/line-ending
churn was removed after inspection; no application changes are retained.

Simulation advisory warnings describe completed match-play closeouts/incomplete
fixtures, with one suspicious outcome; comparison itself has zero differences.
**Flamtana is absent from simulation-engine.js.** Neither the 77-round comparison
nor the four simulation tests establish Flamtana correctness. Its coverage here
is the actual-engine stress harness, release-specific tests and two-device flow.

Reference PDF page counts stayed **Nassau 8, Nine Point 5, Sixes segments 5,
Sixes points 5, Wolf 5, iOS reference 11, Flamtana 7**. All seven freshly generated
PDFs have identical page counts and extracted text to the committed references.
Existing PDFs were retained to avoid generation-date-only changes.

## 2. Complete two-device path on .68

Used **two isolated Chrome browser contexts**, each with independent localStorage,
and a shared in-memory Supabase API test double. Only the client connection/auth
provider and automatic scheduling were replaced in the harness; production form
creation, code generation, publication payloads, join RPC invocation, download,
registration, hydration, local commit, assignment validation/publication, Start,
score controller, durable outbox, RPC acknowledgement, parity reconciliation,
finish/freeze and normal mobile report export executed from the unchanged app.
No live match or production data was created or changed.

The sequence completed:

1. **Create** through the Match form, with eight golfers, four teams, assigned
   indexes −2/0/10/35, 18 holes, $20-per-person stakes and all eight Calcutta picks.
2. **Join** through the empty remote device's actual Join Match UI and register it.
3. **Assign** all eight golfers: T1/T2 to the host and T3/T4 to Cart 2; validate
   both foursomes before Start. The remote could edit only T3 and T4.
4. **Start Scoring** through the host control. Center the control clear of sticky
   chrome in browser automation; native phone touch reachability remains a manual
   acceptance item.
5. **Score all 18 holes** through Play inputs and Save on both devices, the host
   in ascending hole order and Cart 2 in descending order. Each team write updates
   both partners and queues through the existing outbox.
6. **Push and reconcile**: 144 scored partner rows, with local and remote ledger
   counts both 144 and parity confirmed on both devices. API test-double calls:
   **5 publish_shared_match_owner, 1 join_shared_match, 2 submit_shared_score_operations**.
7. **Complete and freeze** through the production completion prompt and durable
   save path. All team stats arrays remain absent.
8. **Export** through the normal same-tab mobile Ledger Entry route: **8 pages**.
   The report navigation preserves the already-frozen record byte-for-byte.

Inputs reproduce .62 stress round 01. **Every component's money, combined payment
instructions and complete Flamtana evidence JSON are byte-identical to that .62
baseline.** Net positions are:

| Golfer ID | Net dollars |
| --- | ---: |
| p0 | −80 |
| p1 | −80 |
| p2 | −40 |
| p3 | −40 |
| p4 | +40 |
| p5 | −40 |
| p6 | +160 |
| p7 | +80 |
| **Total** | **0** |

Payments remain p0→p6 $80, p1→p6 $80, p2→p7 $40, p3→p7 $40 and p5→p4 $40.
The 50-round run separately asserts .62 equality for every scenario's five
component amount maps, combined payments and complete saved evidence, including
ties, plus handicaps, uneven cents, unbacked Calcutta winners and exhaustion.

## 3. Large pre-.68 saved-state storage rehearsal

Built and finished historical rounds through the committed .67 live engine, then
loaded them normally in the final .68 browser application. **This is realistic
generated historical data, not a copy of John's phone's storage.** The 23-round
state contains:

- 18 frozen Flamtana rounds, with default stats and real capped sync telemetry;
- 3 frozen individual rounds with actual recorded statistics;
- 1 individual round retaining recorded stats after tracking was disabled;
- 1 unfinished Flamtana round, plus a queued score operation;
- the full primary and backup, a re-downloadable cloud cache and the outbox.

| Measurement | Before load | After compaction |
| --- | ---: | ---: |
| Primary JSON, UTF-8 bytes | **2,267,258** | **1,290,336** |
| Approximate total localStorage UTF-16 bytes, including keys/backup/cache | **9,269,180** | **5,366,070** |

Primary relief: **976,922 bytes (43.1%)**. Total estimated relief:
**3,903,110 bytes (42.1%)**. UTF-16 estimates and Chrome's storage accounting must
not be read as iOS Safari's available quota or an exact number of remaining rounds.

Automatic startup compaction fired. A repeated call to the production load path
made **no additional change** to the compacted save, and the compaction function
reported no further removable data. A second normal browser startup retained
the compacted arrays and preserved all frozen records, recorded stats and payments.
Normal startup updates presence timestamps/device registration, featured-display
selection and active progress bookkeeping; the entire app state is therefore not
expected to remain byte-identical across sessions. Compaction itself is idempotent.

**All 22 frozen records, all recorded stats in the four individual rounds, all frozen payments
and the queued outbox operation were preserved.** The untracked round with real
statistics retained every player's stats rather than partially compacting it.
The active round's score facts remain present and it stays unfrozen.

The repeatable single-round benchmark also remains:

| Completed fixture, UTF-8 JSON bytes | .67 | Final .68 |
| --- | ---: | ---: |
| Shared Flamtana | 102,872 | 51,199 |
| Exhaustive Hole 18 card-off | 110,600 | 58,927 |
| Tracked individual, no shared telemetry | 69,721 | 69,721 |
| Exhaustive card-off with injected legacy 200-event trace | 143,661 | 58,927 |

Tracked stats occupy the same **22,504 bytes**. New team rounds have no stats
arrays. Recorded games, report player facts and money match across versions.
The actual saved-round sizes depend on course snapshots, evidence and telemetry;
these measurements do not guarantee 43 rounds will fit on every phone.

## 4. Regression sweep: .63 through .68

All release-specific tests below ran in the full suite; a separate focused sweep
also passed **38/38 tests, 0 failures and 0 skips**, in 22,447 ms on the exact final
build. No app fixes were made for the sweep.

| Release | Verified behavior |
| --- | --- |
| .63 | Opening/deciding and candidate-narrowing card-off steps print; non-narrowing runs condense; exhaustion explicitly splits; Calcutta references Featured rather than duplicating evidence. The stress harness checks every required printed evidence step |
| .64 | One tee selector per pair, teams may use different tees; assignment refresh/validation gates Start; par-first +/− controls retained |
| .65 | Actual-browser quota recovery still reclaims redundant cache/backup data; failed authoritative writes keep the prior saved match and roll back an unsuccessful join |
| .66 | Four team rows use the standard Classic scorecard markup; Play off-low strokes use the lowest of all four team handicaps; full Course Net/wagers remain unchanged; horizontal controls and ordinary-game picker/preview behavior remain covered |
| .67 | Frozen inclusive Nassau/press facts print separately without adding a payment; accepted-report correction uses a display clone; the $14 fixture and saved press detail/story safeguards remain intact |
| .68 | Stats materialize only when appropriate, enabling tracking preserves prior real rows, exact-default compaction is conservative/idempotent, frozen telemetry is reduced, actual quota errors name the remedy, and diagnostics wrap at larger text sizes |

Final 50-round report counts:

| Tie method | Runs | Pages per report |
| --- | ---: | ---: |
| Split | 13 | **7–8** |
| Hole 18 backwards | 13 | **8–10** |
| Back nine | 12 | **7–8** |
| Last six | 12 | **8–10** |

The condensed-page ranges remain the reduced .63–.68 figures. No physical-page
mismatch, report overflow, missing required evidence step or settlement difference
was found in the 50 stress cases.

## 5. Confirmed diagnostic defect — reported, not fixed

**After successful completion, Support may show Frozen RoundRecord: No even
though the just-completed round is frozen.** `renderBuildInfoUi` selects only
`getActiveMatch()` (app.js:26379), while completion clears activeMatchId and keeps
the completed review separately. Its frozen-status line then evaluates no match
(app.js:26408).

The production browser probe captured **activeMatchId:null, completed review
present, displayedFrozen:"No", actuallyFrozen:true**. Settlement, durable save,
the frozen record and report are correct. This is a misleading diagnostic display,
not a failure to freeze. No fix or refactor was made. The event runbook explains
the limitation and uses completed status/final wager results rather than that line.
Under feature freeze, my recommendation is to retain the tested scoring build
and this mitigation unless John explicitly chooses to authorize a display fix.

Previously identified setup-warning routing and handicap-preview header/"Gets"
clarity work remains deferred. It has not been silently included in verification.
The runbook explicitly distinguishes full Course Net from Play's Off low figures.

## 6. Confidence limits and event readiness

I am confident in the unchanged engine's cent-level results for the exercised
cases, the release regressions covered by these gates, and lossless compaction of
the tested historical data. **I am not claiming a completed live-service or
physical-iPhone acceptance.** The local API test double cannot prove Supabase's
production RLS/admission behavior, network retries under the event's real signal,
iOS-specific storage headroom, service-worker update adoption, or that compaction
has actually run on John's two phones. Chrome with an iPhone user agent is not
an actual iPhone/Safari test.

Before Friday, John should confirm .68 on both phones, verify saved rounds after
compaction, join a new rehearsal match on the actual service, assign every golfer,
Start and enter/correct/save a team score from each phone. Confirm Pending resolves
on both sides and practice the host takeover. That physical rehearsal remains the
operational acceptance step; automated green alone does not establish event readiness.

No new scoring, settlement, storage-data-loss or report-evidence defect was
confirmed. The diagnostic discrepancy above is real and remains unfixed.

## 7. Event runbook and post-event boundary

Use [FLAMTANA_EVENT_RUNBOOK.md](docs/FLAMTANA_EVENT_RUNBOOK.md): setup in order,
all-eight assignment/picks check, Pending remedy, host takeover, storage-full
response, completion/report, and manual settlement. Its Foursome fallback sums
per-hole lower team nets, never the lower team total.

After October 16 only: cloud archive with ten most recent completed rounds plus
everything unfrozen hot and a lightweight local index; Flamtana simulation-mirror
coverage; sparse stat-row shape; further report polish and deferred setup clarity.
These are logged, not implemented or automatically started.

Verification logs, browser rehearsal results and PDFs are retained locally under
tmp/report-qa/v69. Application tracked files are unchanged from 9a8459e; the retained
changes are this verification report and the event runbook. No commit, push,
deployment, live match publication or database migration was performed.
