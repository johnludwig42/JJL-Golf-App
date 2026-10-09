# v31.0.54 - Stroke Play Ledger Graphic

## Scope

Featured stroke-play reports use a strokes-behind-the-leader chart and Position
by Hole strip. The full player/team-name legend sits above a wider, taller graph;
right-side labels and the separate Lead Fixed box are removed. Overlapping runs
use dashes. Every hole has its own axis tick, hole number and par. Integer margin
gridlines and data-derived finishing ranks preserve ties.

Net report scores use off-low playing allocations. Detailed gross/net hole scores
and allocation dots remain in the appendix. Colors are assigned once and reused in identity
labels, strips, standings and appendix names. Other games retain their views.
Nonfeatured stroke play receives the same module in its game-detail section.

Lead fixed is the first hole where the final leader set becomes permanent. The
swing is the largest gain by any eventual winning entry against an entry leading
at the beginning of a contiguous run of at most four holes, ending no later than
lead fixed. The analysis, including hole/par/yardage/stroke-index details, is
explained in the Story of the Round rather than repeated on the cover.
Equal gains select the earliest end, then shortest run. Provisional
rounds do not claim a final leader or decisive swing.

The gross/net-to-par strip is removed from both featured and nonfeatured modules.
The Handicaps block follows Highlights on the cover for the reference net and
gross rounds. It packs normally, stays together when
possible, and if it moves off the cover starts page 2 before the story. Team
indices remain separate, tees are retained and handicap allocations are combined.
Per-game columns collapse only when their allocation values match; footnotes
retain each game's basis.

The Product Owner explicitly selected off-low for all newly generated net
reports even where the app's individual Low Net results use full course handicap.
This report-only comparison is labeled as a report basis. App scoring, settlement,
RoundRecords, localStorage, Supabase and the score-entry screen are unchanged.
The course-net appendix remains informational and keeps its original values.
Accepted report snapshots and approved stories are not silently overwritten;
use the existing Revise and story-review flow to regenerate an accepted report.

New stroke story payloads and deterministic fallback text use the same report
scores, leader set and swing. Course-net highlights are removed from stroke
covers. Report snapshots, both appendix cards and existing scoring engines remain
independent of the app's dark appearance.

## Reference acceptance

Southern Dunes, October 5, 2026: Mark & Kell and Magic & Crabby Pants tie at 70;
Hush & Lud score 71 and Neil & Kappy 72. The allocations are 6/0/5/5. Lead fixed
is hole 15. The explicit maximum-gain rule selects holes 7-10: Magic's net
3/4/3/3 totals 13 versus the starting leader Hush's 4/4/5/5 totals 18, a five-stroke
gain. The sample's 13-15 band is the later catch-up (four strokes), not the largest
gain under the specified rule. The tied winners match 5/4/4 over holes 16-18.

## Verification

- `npm test`: all 1,175 tests passed, zero failures, skips or cancellations.
- Nine focused unit tests cover appendix-derived allocation values, leader gaps,
  ties, permanent leader sets, swing selection, gross/net rendering, incomplete
  rounds, counting-score reconciliation, per-game handicap columns and story facts.
- Four focused browser cases passed: net/gross reference covers, nonfeatured
  stroke detail and handicap overflow to page 2. The two covers match reviewed
  computed-data and exact PNG snapshots. All 50 existing report scenarios and
  their print-preview checks passed. The two PDF previews were rendered
  and visually inspected, including the cover handicap table and both appendix cards.
- `npm run lint`: zero errors and 88 existing warnings. `npm run validate` and
  whitespace checks passed. `npm run release:sanity`: six passes, three expected
  warnings for uncommitted work and the omitted target argument, zero failures.
- `npm run simulate:compare`: 77 scenarios, zero failures and zero live/mirror
  differences; 55 informational warnings and one settlement-size review flag.
  `npm run test:simulations`: all four passed.
- `npm run check:layout`: all six existing HTML/PDF/iOS layout fixtures passed.
  Generated reference reports and simulation output were restored afterward.
- Self-review confirmed that only report projection/story facts, report rendering,
  release metadata/assets, documentation and test support changed. Scoring engines,
  frozen records, acceptance/revision handlers, cloud schema and input UI are untouched.
- Following the cover refinement, nine focused unit tests and five browser tests
  passed. The graph expands into the former right-label area; the cover has no
  Lead Fixed box and the story retains the analysis. Updated snapshots and both
  PDF covers were rendered and reviewed.

## Constitutional review

Principles 6, 7, 8 and 22: authoritative gross scores and recorded allocations
remain the source; the module derives report analytics without changing results
or settlement. Principles 10 and 11: accepted snapshots and approved historical
stories remain preserved and use the existing explicit revision flow. Principles
1 and 23: no ownership, identity, access, deletion or privacy changes. No
constitutional conflict identified. Implementation authorized by the Product Owner.

## Release and acceptance

Branch: `codex/v31.0.54-stroke-play-report`. New worker cache, immutable branding,
client report helper and report module cache URLs are included. No database or
story-service deployment is required. Changes remain uncommitted and undeployed.
Review the net/gross PDF previews, then verify print/save and iPhone report
navigation with system dark mode on. The visual roadmap resumes with typography
in v31.0.55, components v31.0.56, Play/Insights/icons v31.0.57 and density/preferences
v31.0.58; bottom navigation remains deferred.
