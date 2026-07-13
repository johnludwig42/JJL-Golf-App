# Build Notes v30.3.64 — Mobile Scoring UX Polish, Status Truthfulness, and Quick Scoreboard Upgrade

## Release theme

Make a live round easier to read, catch up, and understand at a glance on the smallest supported iPhone without changing scoring, game, payout, settlement, Shared Match authority, or frozen RoundRecord behavior.

## Play tab

- Rebalanced narrow score-row columns so long names truncate before the Gross, Stroke, and Net columns.
- Standardized compact plus/minus controls and numeric input sizing while retaining direct numeric entry, explicit blanks, confirmation feedback, and ordinary Smart Score Advance.
- Expanded the `Str` heading to `Stroke` and protected numeric alignment.
- Retained the read-only Classic Scorecard source in Player Detail, with Team and redundant Player headings already suppressed; changed its close action to a clearer `Done` control.

## Catch-Up Scoring

- `Jump to Missing Scores` now starts an intentional Catch-Up mode on the first editable missing hole.
- The Catch-Up banner names the current hole, missing players, and remaining missing-hole count.
- `Save & next missing` captures only explicit entries and advances through the editable missing-hole queue.
- Blank scores remain blank; no par or other score is fabricated.
- Ordinary Smart Score Advance is disabled only while Catch-Up mode is active and resumes on exit.
- Exit returns to the hole that was active before Catch-Up.
- Shared Match queues use the existing `canEditPlayerScore` authority gate, so joined devices see only missing scores they own.

## Truthful game status

- The Scores Match Status fallback now uses the existing compact competition-status helper instead of a hard-coded `Live` tile.
- Concrete current, tied, final, incomplete, clinched, and not-started states remain derived from trusted game summaries.
- Lifecycle state is secondary to the competition score.
- No second status or game-calculation engine was introduced.

## Momentum presentation

- Added one shared presentation model and SVG renderer for Nassau, team match play, singles match play, and SSP.
- Final/current leaders are oriented on the positive upper side; the trailing side is negative/lower.
- Ties retain the configured stable perspective.
- Configured team names are preferred. Otherwise labels use concise first-name combinations; same-name players remain distinct accounting identities.
- Full and compact charts share the same transformation and labels.
- The zero baseline uses the stronger `momentum-zero-baseline` style, while source values remain unchanged.
- Full and compact charts now include a visible numeric y-axis with deterministic, symmetric bounds around zero.
- Scale steps use clean integers; positive ticks use explicit plus signs, negative ticks retain minus signs, and zero aligns exactly with the bold all-square baseline.
- Full charts show the complete clean tick sequence (generally five to seven labels), while compact Quick Scoreboard charts retain only the upper bound, zero, and lower bound.
- Secondary horizontal gridlines remain lighter than the zero baseline. Match/Nassau axes are labeled in holes and SSP axes in points.

## Scores featured-card polish

- Narrow-screen spacing, headline sizing, settlement wrapping, player/Course HCP footer layout, and momentum spacing were relaxed without removing truthful content.
- Supporting elements remain visually subordinate to the winner/current-result headline.

## Quick Scoreboard

Section order is now:

1. Round context
2. Active Games
3. Players
4. Teams, when useful
5. Money
6. Momentum

The redundant standalone featured-game status box was removed. Active Games uses concrete trusted status. Money now shows non-zero player contributions per trusted payout game followed by the existing combined player totals; unavailable attribution is omitted. Eligible games receive separate compact momentum cards, capped at three, and invalid/empty series create no card.

## Files changed

- `app.js`
- `style.css`
- `index.html`
- `manifest.json`
- `service-worker.js`
- `package.json`
- `package-lock.json`
- `tests/mobile-scoring-ux.test.js`
- `BUILD_NOTES_v30.3.64.md`

## Tests added

Focused fixtures cover truthful Nassau and SSP states, final/incomplete/tied/not-started handling, leader-positive momentum orientation, first-name fallbacks, same-name safety, bold zero-baseline markup, full/compact consistency, non-mutation, Quick Scoreboard ordering, trusted money reconciliation, frozen-snapshot preservation, and explicit Catch-Up queues.

## Validation results

- Syntax checks passed for `app.js` and `service-worker.js`.
- Release sanity passed 8 checks with the expected dirty-tree warning and 0 failures, both directly and through npm.
- Full suite and `test:run`: 86 passed, 0 failed.
- SSP: 34 passed; SSP Shared Match: 5 passed; Shared Match: 8 passed; course: 16 passed; live engine: 4 passed.
- Focused mobile/status/momentum/Quick Scoreboard/Catch-Up suite: 5 passed.
- Focused report, RoundRecord, and mobile presentation group: 15 passed.
- `test:money` could not run because its configured `tests/money-math.test.js` file does not exist. Money reconciliation remained covered by the full suite, SSP fixtures, simulations, and the new focused reconciliation assertion.
- Standard, live, and compare simulations each completed 60 rounds with 0 failures and 60 exact live/mirror matches. The 100-random run completed 110 total rounds with 0 failures and 110 exact matches.
- Expected provisional/clinched warnings remained. The sole suspicious fixture was the pre-existing `blowout_match_play` threshold diagnostic.
- `npm run lint` could not start because the local `eslint` executable is unavailable; no lint assertions ran.

## Known limitations and manual recommendations

- Catch-Up is deliberately narrow: it provides a missing-hole queue and explicit next/exit controls rather than a separate full-screen scoring application.
- Skins do not receive a continuous momentum chart because the existing model does not support a sufficiently intuitive lead line.
- Game-level money rows are displayed only when the existing payout context provides authoritative amounts.
- Small-iPhone Safari, long names, stat tracking, modal scrolling, and host/joined-device Catch-Up ownership require manual device QA.

Game, handicap, payout, and settlement math were not intentionally changed. Frozen RoundRecord creation, transactions, report non-mutation, reopening, and supersession behavior were preserved. Codex did not commit or push.
