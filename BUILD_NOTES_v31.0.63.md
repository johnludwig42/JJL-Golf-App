# The Dye Ledger v31.0.63 — Flamtana Report Readability

## Authorized scope

Rendering only. Print the full opening net-total comparison and every saved step
that changes the candidate set. Collapse consecutive matched steps into named
ranges; explicitly state when card-off exhausts and splits. Calcutta references
Featured and prints its pool/shares/backers/unbacked partner recipients. Reserve
space between team names and the Holes column in the scoped team summary table.

No changes to resolveFlamtanaStrokeResult, computeFlamtanaResults,
distributeFlamtanaCents, saved evidence, settlement, scoring, saving or sync.
App edits are limited to release metadata/version labels. The full evidence stays
in frozen RoundRecords. A report-only helper reads saved steps without mutation;
it is included in the offline asset cache. No migration, new dependency or role
change. Existing individual-report rendering remains unaffected.

## Constitutional review

Owner John; October 10, 2026; authorization “Then proceed” in the .63 review.
Direct: 6 (authoritative record), 7/8 (presentation versus saved facts), 10/11/12
(frozen historical integrity), 22 (final results). Evidence and settlements remain
unchanged; only printed presentation is condensed. No identity/ownership, Event
Record, membership/attendance, privacy/deletion or Amendment Session impact.
No constitutional conflict identified.

## Verification

Full suite: 1,366/1,366 pass. Lint: zero errors, 88 existing warnings; report-helper
and stress-runner lint also pass. Release validation and all seven layout fixtures
pass. Default release sanity: six passes, three development warnings, zero failures.
Simulation comparison: 77 exact matches, zero differences/failures (62 warnings,
one suspicious outcome); simulation tests 4/4 pass. These simulation gates do not
cover Flamtana, as explicitly logged below.

The 50-report stress run passes with every component amount, combined payment
row and complete saved evidence byte-identical to .62. All three protected engine
function bodies are byte-identical, and the complete app diff is release metadata
only. Rendering assertions verify every candidate-set change and coverage of every
matched step; Calcutta has no duplicated comparison block.

Page ranges (same 25 desktop / 25 simulated iOS surfaces as the .62 baseline):

| Tie method | Before | After |
|---|---|---|
| Split | 7–8 | 7–8 |
| Back nine | 7–8 | 7–8 |
| Last six | 8–10 | 8–10 |
| Hole 18 backwards | 9–11 | 8–10 |

Final refined reports: 414 → 396 PDF sheets, 18 fewer overall. One varied-score
desktop case grows from seven to eight pages after the requested team membership,
handicap context and heading spacing; the per-method ranges remain unchanged.
Standard Flamtana reference: 7 → 7 desktop pages, regenerated from the production
shell and fixture generator. Complete worst-case evidence retains all 95 saved
steps; printed comparison content becomes four opening lines, four matched ranges
and four exhausted-split statements. Calcutta references Featured rather than
reprinting its 19 comparisons. See reports/FLAMTANA_REPORT_READABILITY_RESULTS.md
for per-run PDF links and before/after results.
Physical iPhone/live two-device acceptance remain separate.

## Git and preserved review outputs

Started on .62 at 5e065f7; .62 merged in PR #159. New branch
codex/v31.0.63-flamtana-report-readability from origin/main a42d9bc.
The starting tree contained generated report PDFs/HTML and simulation output.
Their bytes were preserved before work. Only Flamtana references are intentionally
regenerated; other pre-existing outputs are restored after gates. Changes remain
uncommitted; no push, merge or deployment.

## Manual review

1. Review a tied card-off report: full opening totals, named matched ranges, every
   narrowing/deciding comparison and explicit exhausted split.
2. Confirm Calcutta references Featured rather than copying its evidence. Check
   pool, shares, picks/backers and unbacked partner recipients.
3. Review long team names and the page-1 Holes column in desktop/iPhone print.
4. Reopen an existing frozen .62 round: saved evidence/results remain complete
   and unchanged. Review its newly rendered report before accepting/exporting.

## Post-event follow-up

After October 16: add Flamtana to the standing simulation engine/comparison gate.
The existing simulate:compare command does not exercise Flamtana; its passing
results must not be presented as Flamtana coverage. The dedicated stress harness
provides current coverage. This follow-up is logged, not implemented in .63.

## Final implementation review

Changed areas: report renderer and its pure evidence-formatting helper; scoped
team-summary spacing; helper offline asset caching; release identity/icons; two
focused test files; stress assertions and optional baseline/output configuration;
Flamtana fixture JS/HTML/PDF; release/context/roadmap documentation and comparison
results. No scoring, storage, sync, settlement, role or historical-fact change.
User review outputs restored byte-for-byte apart from the explicitly requested
Flamtana references. No deleted files or whitespace errors. Uncommitted for review.

## Approved pre-commit presentation refinements

The Product Owner approved six refinements: Card-Off labels directly before the
results; clearer wager headings/spacing; both partners below each team on page 1;
one saved team-index / CH / PH table and formula before other results; Calcutta
results before supporting score tables; fixed Group 1 → Group 2 → Foursome chart
order. All implemented in the renderer/shell. Handicap values are read from the
report snapshot, not recalculated. Calcutta picks and net results are combined in
one eight-player table rather than repeated. Team membership uses saved member IDs
and saved golfer names. Ordinary reports retain their existing behavior.

Focused browser assertions verify membership on the first page, explicit Card-Off
labels, handicap/result ordering, early Calcutta and all three chart IDs in order.
The 50-run stress rerun passes with component amounts, combined payments and full
evidence still byte-identical to .62. Standard reference remains seven pages.
Final full-suite rerun: 1,366/1,366 pass. All requested gates pass, including
50/50 stress reports with preserved settlement/evidence bytes. Pre-existing review
outputs restored byte-for-byte; Flamtana references intentionally regenerated.
Page 1 and page 2 print screenshots were visually reviewed. The final Foursome
caption explicitly names per-hole team minima. Changes remain uncommitted.
