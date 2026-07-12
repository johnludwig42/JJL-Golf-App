# Build Notes v30.3.61 — Analyst-Style Match Summary, SSP Momentum and Round Timing

## Release theme

Turn Scores / Match Summary into a compact round memo: result, economic drivers, settlement, turning points, timing, and an auditable Classic Scorecard.

## Changes

- New rounds start `roundTiming.startedAt` only when setup successfully transitions into Play. Shared hosts start timing when Start Scoring is tapped. Setup entry and later setup edits do not reset the clock; legacy rounds without a start remain “Timing unavailable.” Completion records `endedAt`, preserving it unless a safely reopened round is recompleted.
- A hole’s first full save records `holeFirstCompletedAt[holeNumber]` once. Later corrections never replace it. Older and shared matches tolerate missing timing metadata.
- Play shows a quiet elapsed/pace line. After three completed holes, projections use elapsed time divided by completed-hole count times selected-hole count, with the correct 9/18/custom denominator and an estimated local finish time. Completed rounds show actual duration, start, and finish.
- Scores and Match Summary now lead with an Executive Round Summary containing status, course/snapshot context, completed-hole scope/list, timing, Featured Competition, settlement leader, low gross/net, key takeaways, and compact awards.
- Incomplete and out-of-sequence reports use completed-hole counts and lists rather than the highest hole number. Copy consistently says “Incomplete Round — Provisional” and clarifies that unplayed holes are not estimated. AI recap context receives the same guardrails.
- SSP Featured Competition now uses the valid final SSP ledger leader instead of falling through to an unavailable message. SSP Momentum is a zero-centered SVG line chart with axes, dots, played-hole labels, final result label, and key swings; missing SSP holes are never fabricated.
- Incomplete reports use “Net Settlement — Provisional”; complete reports use “Final Net Settlement.” Payment arrows are spaced. “Gross Game Detail” is now “Game Payout Detail,” and “Gross Total” is “Game Total,” with explicit pre-settlement audit wording. Settlement math and one-time SSP inclusion are unchanged.
- The Classic Scorecard remains the default/fallback with its traditional gross/net/dots layout. Handicap/SI Out/In/Total cells are intentionally blank because SI totals are not meaningful.
- Pending momentum holes say “Not played,” interactive controls remain hidden in print, the forced page break before payout detail was removed, and SSP/report sections use less aggressive page-break constraints to reduce sparse or blank trailing pages.

## Tests

- Added focused coverage for timing start immutability, safe end timing, duration formatting, three-hole projection threshold, out-of-sequence completed-hole scope, 18- and 9-hole denominators, immutable `firstCompletedAt`, SSP Featured Competition, and blank Handicap/SI totals.
- Full validation results are recorded in the final implementation report.

## Known limitations

- No manual pause/resume clock is included. Weather, turn delays, and long app-idle periods remain part of elapsed time.
- Legacy rounds without a trustworthy start timestamp show no fabricated duration.
- Hole timestamps reflect first fully saved completion, which may be slightly later than physical hole completion.
- Browser print engines can still add configured browser headers/footers. PDF pagination should receive device-level manual QA.
- The existing non-user-facing `random_035` zero-balance mirror normalization difference remains outside this release.

## Manual QA

Use a fresh profile and `npx http-server . -p 5173 -c-1`. Confirm setup alone does not start timing; local Play transition and shared Start Scoring do. Verify the projection threshold at three holes, out-of-sequence completed-hole lists, completed round duration, Executive Round Summary, valid SSP Featured result/chart, settlement labels/arrows, preserved Classic Scorecard with blank SI totals, hidden print controls, and no blank trailing PDF page.

## Hotfix — SSP Play renderer runtime isolation

- Removed a release-blocking, misplaced Scores-only `executiveSummary` assignment from `renderSneakySandyPoleyEntry()`. The Executive Round Summary continues to render in `renderLeaderboard()`, while Play SSP controls are independent of report DOM state.
- Added a structural regression test proving the SSP entry renderer contains no Executive Summary dependency and the Scores renderer retains the intended summary target/build call.

## Hotfix — Match Summary optimization and print hardening

- SSP report inclusion now follows the selected game explicitly: unselected SSP is omitted; selected SSP with counted ledger holes shows its summary, momentum, swings, settlement, and audit table; selected SSP without a countable ledger shows a compact pending state in Scores and export rather than disappearing. Missing older/shared metadata remains safe, and prior holes are never backfilled.
- Reordered Match Summary into an analyst hierarchy: Executive Round Summary, Net Settlement, Game Drivers, Momentum / Turning Points, Classic Scorecard, AI Round Recap, then Appendix / Audit Detail.
- Promoted the current money result to the Executive Summary headline. Round scope, timing, featured competition, leaders, awards, and takeaways remain secondary. The duplicate AI recap teaser was removed when the full recap is available later in the report.
- Game Drivers now pair active-game status with current payout contribution and provisional/final state without changing settlement math. SSP continues to enter combined settlement exactly once.
- Incomplete team momentum renders completed holes plus a compact unplayed range instead of eighteen large pending tiles. SSP momentum continues to use counted SSP sequence only.
- Print pagination gives the Classic Scorecard and full AI recap clean major-section boundaries, relaxes oversized keep-together rules for recap/SSP/appendix sections, and keeps Score Distribution in the appendix after momentum.
- The Classic Scorecard and its traditional gross/net/dots, yardage, par, blank Handicap/SI totals, and Out/In/Total structure are preserved.
- Added focused regression coverage for SSP valid/pending/unselected inclusion, analyst section order, compact incomplete momentum, Classic Scorecard presence, and recap-teaser de-duplication.

Manual QA remains required in a fresh browser profile for both SSP and non-SSP matches. Inspect print preview/PDF for section collisions, the scorecard page boundary, recap pagination, appendix ordering, hidden controls, and blank trailing pages. Browser print headers/footers and device-specific pagination remain outside application control.

## Final hotfix — report polish and PDF collision fixes

- Fixed the SSP chart’s black filled triangle in standalone exports by making the polyline explicitly line-only and including SSP chart styles in the generated export document. Completed-hole dots, zero line, final result, favored-team convention, and human-readable swing descriptions remain visible.
- Moved the dense SSP hole-by-hole audit table into its own Appendix section and grouped full Player/Team leaderboards under one Appendix heading. SSP summary/momentum remain in the main report, preventing the audit table from colliding with a following leaderboard.
- Executive Round Summary now displays a concise existing weather snapshot when available. Missing, partial, legacy, or malformed weather data is quietly omitted and never blocks rendering.
- Pace projections now require at least three completed holes, 30 minutes elapsed, and a plausible projected duration: 45 minutes–4 hours for nine holes and 1.5–7 hours for eighteen holes, with conservative scaling for custom rounds. Elapsed time remains visible when projection is suppressed.
- Removed the redundant standalone Round pace card from Game Drivers; Play timing remains unchanged and uses the same eligibility helper.
- Tightened Classic Scorecard copy, collapses a shared tee into “All players: [tee] tee,” and preserves gross/net, dots, yardage/par/Handicap rows, blank Handicap totals, player rows, and Out/In/Total columns.
- Added the deferred “Match Summary v2 / Analyst Report Layout” technical-debt item rather than broadening v30.3.61.
- Added regression coverage for line-only SSP SVG output, dots/final label, pending state, audit isolation, weather formatting/safety, implausible pace suppression, plausible projection, Round pace de-duplication, report ordering, and scorecard preservation.

Manual PDF QA should cover valid and pending SSP, the SSP audit page boundary, combined leaderboards, long Game Payout Detail, weather present/absent, plausible and suppressed projections, Classic Scorecard readability, hidden controls, and blank trailing pages. Native browser pagination and configured print headers/footers remain device-dependent.
