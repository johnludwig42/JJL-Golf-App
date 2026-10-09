# The Dye Ledger v31.0.49 — Report Competition Consistency

## Scope

Team Stroke Play now supplies its saved gross/net, aggregate/best-ball hole scores to the report instead of falling back to a generic course-net chart. Competition standings show scores, completed holes, shared ranks and winnings. Full-course-handicap awards remain separate from game scores. Explicit standalone gross/net choices and informational scoring overviews are distinguished.

Cumulative reports preserve tied leaders and show a permanent-lead turning point only for a completed outright win. Chart labels identify score relative to par. Game appendix labels describe their actual stroke basis rather than assuming every lowest entry plays from scratch.

Entry names wrap in statistics tables. Neutral entry labels and an adjusted-gross eligibility note avoid treating combined scorecards as individual handicap-posting scores. Scoring-only statistics can share a page with leaderboards. Story generation receives the report competition data and rejects unsupported ball-striking or weather-causation claims.

## Validation

- 50 distinct report/browser scenarios passed: 32 Team Stroke Play cases (including the supplied Southern Dunes score reconstruction), eight standalone gross/net cases, five Nassau cases and five 9-Point cases. Includes nine/eighteen holes, gross/net, aggregate/best ball, two/four teams, ties, incomplete rounds, console errors and page overflow.
- Southern Dunes reconstruction: saved game totals 70, 71, 72, 70; cumulative endpoints -2, -1, 0, -2; two tied leaders and no invented permanent-lead turning point.
- 99 report/story, Wolf and Sixes regression checks passed. An additional Chrome print-media check passed with no clipped page content and a hidden action bar.
- Scoring comparison: 50 random rounds plus 27 fixed fixtures, zero failures and zero live/mirror differences. The simulator reported 63 informational warnings and two review flags; these are not calculation differences.
- Release validation passed. Lint: zero errors and 88 existing warnings. Diff whitespace checks passed.
- Browser screenshots were reviewed. Actual iPhone AirPrint/PWA behavior and newly generated live AI stories remain production smoke checks; no live cloud data or external story service was used in this validation.

## Deployment

No database migration or scoring-rule change. No live records or accepted report snapshots are rewritten. Existing accepted reports remain frozen; unlock and regenerate when a revised report is desired. Branch: `codex/v31.0.49-report-competition-consistency`. Implementation is local; no commit, push, merge or production deployment performed by Codex.
