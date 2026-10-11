# The Dye Ledger v31.0.67 — Press Report Reconciliation

## Scope and observed problem

John authorized the report review corrections after the Prairie View October 11
PDF. Reconstructed printed scores/CH 9 and 11 reproduce Nassau $10 to Tom, an
inherited $5 H5–H9 press to Tom and Greenies $1 to John: payment remains $14.
The legacy frozen Nassau amounts include their press payments, while press game
records have no independent amounts. Report mapping consequently printed Nassau
$15 and Press $0. Saved press audit transactions retain the actual $5 payment.

Separate printed base/press money using existing saved audit transactions; never
add another press payment or change the authoritative payment instructions. Keep
legacy inclusive frozen records unchanged. Deduplicate press transaction IDs and
keep halved/voided/superseded presses at zero. Display the saved press result and
stake plus its own hole range, scores, allocation and per-player money. Press
snapshot policy is used independently of the current Featured allocation.

Show Nassau payouts by Front/Back/Overall, with tied components $0 and per-losing-
player stakes clearly labeled. Use one perspective across segment scores and their
caption. Correct identical-margin footnotes and distinguish No award from genuine
carryover. Fix the team summary column count so Match remains visible. Wrap
appendix tee/CH/PH allocation metadata and omit redundant one-person side names.

Reject the identified front-at-turn, press-margin and sustained-weather narrative
claims in new generation/acceptance validation. For an existing saved narrative
containing these contradictions, print a facts-based recap and retain the original
saved narrative unchanged. This is targeted verification, not a guarantee that
all possible natural-language inaccuracies can be detected.

Safari/AirPrint adds its own headers/footers outside report HTML; the application
cannot force that setting off. Existing print guidance explains the limitation.
Generated PDFs explicitly omit browser headers/footers. No promise to remove
AirPrint-added metadata from the user's phone print dialog.

## Constitutional review

Owner John; October 11, 2026. Principles 6, 7/8, 10–12, 22 and 23: preserve frozen
facts, saved narrative and settlement finality; separate derived printed accounting
from authoritative payment records and keep audit evidence. No RoundRecord rewrite,
settlement engine, roles, identity, schema migration or production database change.
No conflict or Amendment Session required. Flamtana engine/evidence remain locked.

## Verification

Results follow after completion. The synthetic Prairie View regression fixture
reproduces the supplied scores and printed handicaps. Its rating/slope are synthetic
and must not be treated as actual course-library facts or a replacement for the
user's original saved round. Physical acceptance: reopen that saved round, export a
new Ledger Entry, verify Nassau $10 / Press $5 / Greenies $1 and unchanged $14 payment,
press H5–H9 1 up, readable CH/PH labels and facts-based story where required.

Accepted-entry coverage: accepted Ledger Entries bypass the ordinary report builder.
The export path now makes a display-only clone and projects audited Nassau/press
rows into it. Captured scorecards and handicap allocations are retained, including
when living library handicaps change. Payments, the stored accepted report and its
frozen RoundRecord remain unchanged. A scorecard, missing-press or payment mismatch
retains the original accepted report with a revision note instead of guessing.
An archived press with a different, unavailable allocation prints its saved result
and payment without inventing hole comparisons. This projection is Nassau-only;
accepted Flamtana snapshots retain their existing path and data.

Final focused verification: 35/35 core report, story, press-accounting and style
contract checks pass. Real browser scenarios 3/3 pass: desktop/iOS five-page
reproduction, pending partial segments, and the actual app's accepted-entry export
path. The latter confirms unchanged localStorage accepted report and RoundRecord.
The archived-allocation/profile-change and mismatch/idempotence unit cases pass.

Lint: zero errors, 88 existing warnings. Release validation passes. Default release
sanity: 6 PASS, 3 development WARN, 0 FAIL. Simulation comparison: 77 exact, zero
failures or differences (59 warnings, one suspicious outcome); simulation tests
4/4 pass. This mirror does not exercise Flamtana; post-event work remains deferred.

All seven regenerated report references pass layout checks with unchanged page
counts: Nassau 8, 9-Point 5, Sixes segments 5, Sixes points 5, Wolf 5, iOS reference
11 and Flamtana 7. The supplied-round regression reproduction remains five pages
on desktop and iOS. All 50 final Flamtana stress comparisons pass with byte-identical
component settlement, combined payments and complete saved evidence against .66;
page counts also remain identical: split 7–8, hole18 8–10, back9 7–8, last6 8–10.
All three protected Flamtana engine functions are unchanged.

Maintenance: the original frozen color baseline remains intact. Two exact approved
.66 team-scorecard overrides are now checked explicitly rather than being rejected
by the legacy baseline comparison. The obsolete source-text NET perspective check
was replaced by live rendering assertions for consistent segment views and labels.

Final full suite after accepted-entry coverage: npm test 1,391/1,391 passed,
zero failures or skips. Final focused checks 35/35 and real browser cases 3/3 pass.
All current implementation changes are covered by the completed full suite.
Generated reference HTML/PDFs are retained and regenerated together; their seven
page counts remain unchanged. No commits, pushes, deployment or original user-PDF
edits were performed. Re-export the actual saved entry after publication; the QA
preview is explicitly a regression fixture, not a replacement for that round.
