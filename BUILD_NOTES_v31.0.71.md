# v31.0.71 — Flamtana Play Readability

John authorized two presentation changes during the event freeze. Started clean
from committed v31.0.70 (8508b2b); branch codex/v31.0.71-flamtana-play-readability.

- Play team rows show the team's saved tee and Gets, retaining partners and hole
  completion/Pending guidance. Team Index and Course HCP are removed from these
  Flamtana rows. Other scramble rows retain their existing information.
- The policy-specific net/wager explanation moves from the score-entry footer
  into collapsed Round rules. Existing legacy rounds retain their accurate full
  handicap explanation; new rounds retain their all-four-teams off-low explanation.
- No scoring, settlement, storage, frozen evidence or shared synchronization changes.

## Verification

- Focused browser check passes for mixed saved tees under both policy versions,
  collapsed Round rules, Gets/completion labels, widths 320/375/430 and 32px root
  text. No page overflow; +/- buttons remain at least 44px in both dimensions.
  The 375px screenshot was visually inspected. No CSS change was needed.
- Lint: 0 errors, 88 existing warnings. Validate passes. Release sanity: 6 pass,
  3 development warnings, 0 fail. Simulation tests: 4/4; comparison: 77/77 exact,
  0 differences/failures, 60 warnings and 1 suspicious outcome. Flamtana remains
  outside the simulation mirror, as previously deferred.
- Layout: 7/7 references pass, 46 total pages. All seven PDFs have unchanged page
  counts and extracted text; original bytes retained to avoid timestamp churn.
- Flamtana stress: 50/50 policy-2 rounds pass, including reports. Games, payments,
  settlement-player data, picks and complete saved evidence are byte-identical
  to the corresponding v31.0.70 off-low baseline across all 50 cases. Page ranges:
  Split 7–8, Hole 18 backwards 8–10, Back nine 7–8, Last six 8–10, unchanged.
- Full regression suite: 1,413/1,413 pass; 0 failures/skips (566.3 seconds).

Physical iPhone acceptance remains separate from local browser verification.
No live server or physical two-phone rehearsal was run for this display-only release.
