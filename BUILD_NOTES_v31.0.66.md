# The Dye Ledger v31.0.66 — Flamtana Play and Setup

## Scope

John confirmed that Flamtana display strokes are relative to the lowest of all
four teams. Flamtana classic scorecards use the ordinary scorecard renderer and
styles with four explicit team entries, gross above full Course Net, totals,
stroke dots and preserved Pending states. No duplicated individual player rows or
irrelevant net-view toggle. Reuse this view from Play Scoreboard and other classic
scorecard entry points. No team facts inferred by spreading a partner record.

Flamtana score entry uses horizontal minus / score / plus controls, par on first
tap, 44px controls and paired writes through the existing Play controller. The
Off low column is display-only, across all four team handicaps, on each team's tee
stroke index. Course Net remains full-handicap and explicitly labeled. Preserve
wager engine, saved evidence, settlements, authority and frozen records.

Ordinary Match setup: add non-selectable blank scroll space after the final real
player option, retained after search reorders options; position against the visual
viewport and update on keyboard resize/scroll. No dummy player or changed selection.

Featured Competition Handicap Preview is a real open/close disclosure. Auto uses
the existing featured competition resolver. Equal handicaps still show rows with
zero Gets; gross competitions explain that no handicap strokes apply. Built-in
Stroke Net previews full Course Handicap. This does not change game calculations.

## Constitutional review

Owner John; October 11, 2026. Requested Flamtana presentation fixes and ordinary
Match setup access fixes. Principles 6, 7/8, 10–12 and 22: distinguish displayed
relative strokes from full-handicap competitive facts; preserve shared authority,
Pending guards, wager finality and frozen evidence. No scoring engine, database,
identity, membership or historical-record change; no conflict.

## Verification

Automated results follow after completion. Manual acceptance: on both .66 phones,
confirm four-team Classic Scorecard from Play Scoreboard; compare visual layout to
ordinary games; use first-tap par controls; verify Off low against the lowest of all
four teams, including the other device's foursome; confirm Course Net stays full
handicap. Open/close the ordinary Auto-selected Nassau handicap preview with equal
handicaps, then search/scroll/select the last saved player with the keyboard open.
Physical shared access acceptance after .65 remains a separate check.

Automated verification: npm test 1,383/1,383 passed, zero failures or skips.
Final focused team/handicap/scoring tests 31/31 passed; final component guard and
team-renderer tests 4/4 passed. Final browser scenarios 2/2 passed: paired par-first
saves, 320/375/430px layouts, 32px text/44px controls, standard four-team Scoreboard
markup, one fixed identity column with horizontally scrolling holes and matching
header colors, Auto net Nassau at equal handicaps, open/close/gross/full Course Net
preview (full CH retained at 50% default allowance), final real player selection,
blank-space placement after search ordering, and visual-viewport keyboard placement.
The full suite preceded the last scoped team-only sticky-column style refinement;
its final markup, scrolling and styling were verified by the focused checks above.

Lint: zero errors, 88 pre-existing warnings. Release validation passes. Default
release sanity: 6 PASS, 3 development WARN, 0 FAIL. Simulation comparison: 77 exact,
zero differences or failures (65 warnings, one suspicious outcome); simulation
unit tests 4/4 pass. The standing simulation mirror does not cover Flamtana and
remains post-event work. All seven Ledger report layout gates pass; Flamtana stays
seven pages. Stress harness: 50/50 reports pass; each component's settlement,
combined payment instructions and complete saved evidence are byte-identical to
.65. All three protected wager functions are unchanged. Generated report outputs
are restored to their committed baseline for this UI-only release.
