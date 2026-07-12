# Build Notes v30.3.62 — Match Summary v2 / Analyst Report Layout

## Release theme

Transform Match Summary from a structured app export into an executive-quality golf round memo: conclusion first, economics second, supporting exhibits next, and audit detail last.

## Executive Summary v2

- The current money result is the dominant headline.
- Primary Drivers explain which selected games moved the money and show their current economic impact.
- Round status, completed-hole scope, timing, weather, featured competition, leaders, and awards are visually secondary.
- Deterministic Key Takeaways provide the short story without duplicating the full AI recap.
- Missing weather, timing, payout, or modern metadata remains safe for legacy rounds.

## Main Report and Appendix

The default Full Detail report is now formally layered:

1. Executive Round Summary
2. Net Settlement
3. Game Drivers
4. Momentum / Turning Points, including featured SSP Momentum when selected
5. Classic Scorecard
6. Appendix / Audit Detail

The appendix contains full Player/Team leaderboards, SSP hole audit, AI Round Recap when present, Score Distribution, Stat Tracking, Game Payout Detail, and reconciliation detail. Sections carry main/appendix, summary/detail, and print-priority metadata to prepare for future compact/full modes.

## Settlement and Game Drivers

- Net Settlement groups Winners and Owers, keeps Settle Up routes prominent, and reduces Cross-foot prominence without changing math.
- Incomplete rounds retain “Net Settlement — Provisional”; completed rounds use “Final Net Settlement.”
- Game Drivers retain game status, stakes/context, payout contribution, and provisional/final state. SSP includes a human-readable primary swing and remains included exactly once in combined settlement.

## Momentum and Classic Scorecard

- Incomplete non-SSP momentum emphasizes completed holes and a compact unplayed range.
- SSP remains a line-only featured exhibit with dots, zero line, final label, team convention, and readable swing narrative; missing SSP holes are never fabricated.
- The Classic Scorecard remains the default/fallback with gross above net, dots, yardage/par/Handicap rows, blank Handicap totals, player rows, Out/In/Total, and unplayed dashes.

## PDF layout system

- Report sections use reusable main/appendix, summary/detail, avoid-break/allow-break, dense, major, and print-priority semantics.
- Major story sections avoid orphaning; appendix tables may split safely; scorecard and SSP audit boundaries remain protected.
- Interactive controls remain print-hidden.

## Report fixtures

Deterministic report tests cover non-SSP incomplete/complete, SSP pending, SSP momentum, two- and four-player matches, out-of-sequence holes, weather available/malformed, legacy metadata, all-square/no-payout, settlement presentation, section ordering/metadata, scorecard preservation, and appendix placement.

## Known limitations and manual QA

- Full Detail remains the only user-facing export mode. Compact/full toggles are deferred.
- Native browser print engines can vary pagination and add configured headers/footers.
- Manual PDF QA remains required for non-SSP incomplete/complete, SSP pending/valid, weather available/missing, out-of-sequence play, no-payout, long recap, dense payout detail, blank trailing pages, and hidden controls.
- A dedicated PDF pipeline, browser-level pagination assertions, themes/branding, shareable web reports, richer pace/weather analytics, historical saved-match fixtures, and two-device Shared Match automation remain future work.

## Validation

Final command results and targeted browser/PDF findings are recorded in the implementation report.

## Final architecture pass â€” Round Record

- Added a test-covered `RoundRecord` schema (`schemaVersion: 1`) assembled from the existing match, metrics, payout, SSP, course-snapshot, timing, weather, and scorecard paths.
- The record carries nullable `tripId`, deterministic round/player references, completed-hole numbers, structured games and audit references, score/stat availability, events, transactions, net positions, payments, and cross-foot.
- Settlement transactions are derived from the existing optimal settlement output. No game, handicap, or settlement algorithm changed.
- Transactions identify payer, payee, amount, round, provisional/final state, combined or single-game source, contributing games, and audit reference.
- RoundRecord is generated on demand for current and legacy matches. It is not persisted in v30.3.62; freezing/migration waits for a dedicated schema and saved-roster pass.

## Event-driven report

- Structured SSP swing, multiplier, lead-change, final-margin, signature-score, blowup, and payout-driver events provide the only narrative fuel.
- Event salience selects a turning point; SSP lead changes and large swings outrank generic payout facts.
- Player capsules render at most one supported signature stat and disappear when no meaningful fact exists.
- Generic AI recap output is no longer inserted into the default Full Detail report. The deterministic Round Story uses RoundRecord facts and excludes coaching filler.

## Three report layers

1. **Hero / Share:** masthead, status, result, event-led story line, compact SSP momentum when available, turning point, settle-up chips, reconciliation, and handicap footer.
2. **Round Story:** short headline/dek, deterministic narrative, supported player capsules, and meaningful awards only.
3. **Ledger / Audit Detail:** preserved Classic Scorecard, leaderboards, SSP audit, 9-Point detail, conditional score/stat summaries, game payout detail, and full settlement reconciliation.

Short rounds suppress awards and main-story score distribution. Invalid timing is omitted when nine or more holes are recorded in under 90 minutes or the duration is under eight minutes per completed hole. `other`/generic early end reasons now render as “Round ended early.”

## Persistence and known limitations

- RoundRecord is an adapter/builder, not yet an immutable saved snapshot. Existing saved matches continue through normalization and on-demand generation; missing modern metadata remains nullable.
- A true local player registry and saved roster model are deferred to v30.3.63 architecture work. Current RoundRecord IDs prefer existing player IDs and use deterministic round-scoped fallbacks.
- 1080Ã—1350 image export was not added. The polished Hero layer is available on screen/PDF; image export remains backlog.
- Native browser PDF pagination still requires representative manual QA. No heavy export dependency was introduced.
