# BUILD_NOTES_v30.3.51.md

Build v30.3.51 - Play Tab Command Center Polish

## Release Theme
The Play tab is the golfer's command center.

## Problem Addressed
During a round, golfers needed clearer in-place answers for hole facts, player tee/yardage context, current standing, Nassau status, and each player's round shape without leaving Play.

## Files Changed
- app.js
- style.css
- index.html
- manifest.json
- package.json
- package-lock.json
- service-worker.js
- TECHNICAL_DEBT.md
- docs/04_PRODUCT_BACKLOG.md
- BUILD_NOTES_v30.3.51.md

## Play Tab Changes
- Added a compact Scoring Input header with a Quick Scoreboard button.
- Kept the Play workflow on the current hole and did not change score entry, Save Hole, Next Hole, Smart Score Advance, or stat save behavior.
- Visual cleanup pass tightened the Play scoring row for iPhone SE / narrow mobile widths without changing score entry behavior.
- Score adjustment buttons are smaller, uniform, rounded, centered, and protected from clipping at narrow widths.
- Player names truncate earlier so Gross, Str, and Net have priority.
- The Strokes header is abbreviated to `Str`, with Stroke/Net body values kept centered and readable.

## Player Detail Modal Changes
- Player Detail remains read-only.
- The modal header now uses the player name with the close button on the right.
- Visual QA fix: long player names in the Player Detail header stay on one line and truncate with ellipsis so the Close button remains visible on narrow screens.
- Removed extra header noise and tightened vertical spacing.
- The player summary, current context, scorecard, and stats appear sooner.
- Single-player Player Detail scorecards blank the course/team cell for course rows.
- Visual cleanup pass removes the Team column from the Player Detail Classic Scorecard only.
- The upper-left `Player` scorecard header is blank in Player Detail because the modal header already identifies the player.
- Added a compact read-only `Games / Action` section when player-relevant game status is safely available from existing computed data.
- Player Detail QA pass keeps the Classic Scorecard player-name cell compact; long names truncate with ellipsis while tee information remains visible.
- Confirmed the Player Detail Classic Scorecard keeps the Team column removed and the upper-left Player header blank.
- Final Player Detail QA fix aligns the H1 header shading with the other hole headers after the Team column removal.
- Final Player Detail QA fix makes the Classic Scorecard yardage row use the selected player's tee yardage for each hole.
- Combo tee Player Detail yardage uses the combo tee's hole-specific source yardage when that hole can be resolved.
- If player-specific tee or yardage cannot be resolved, the Player Detail yardage row falls back to the best safe player-specific yardage or shows a dash without crashing.
- Final Player Detail column-width fix makes H1 use the same Player Detail-only per-hole width as H2-H18, using the existing H10-style hole width as the standard for hole headers, yardage, par, handicap, and score/net cells.
- Final Player Detail first-hole alignment fix prevents H1 from inheriting the old Team-column/sticky-column left alignment; H1 now matches H2-H18 for width, light-green header shading, and centered Yds / Par / Handicap / score values.
- Final Player Detail summary cleanup removes the duplicative top-summary `Match` card and replaces it with a compact `Scoring Mix` card.
- Scoring Mix counts only the player's completed/scored gross holes with valid par, hides zero-value categories, and reports Eagle+, Birdie, Par, Bogey, and Double+ patterns for the round so far.
- Competition and game status remain in the dedicated Games / Action section so the top Player Detail summary stays focused on scoring status.

## Player Detail Games / Action Visibility
- Games / Action remains read-only and uses existing computed game status/results only.
- Nassau, Team Match, Team Stroke, Singles Match, Skins, Net Skins, Greenies, 9-Point, and configured head-to-head side-match summaries are shown when the game is active and the player is involved or represented by the player's team.
- Long Games / Action content wraps instead of being ellipsized, and the section can scroll within the modal so available status is not hidden merely because the viewport is narrow.
- If a game is active but no player-specific state can be safely determined from existing computed data, Player Detail either shows a conservative `Active` status or omits that non-player-specific row.
- This pass did not turn Player Detail into a full Match Summary and did not add editing controls.

## Quick Scoreboard Behavior
- Added a lightweight Play-tab modal showing live player standings, team standings when teams are active, competition status, Nassau status when active, and a simple money summary when available.
- It is dismissible and does not navigate away from Play.
- It does not include Match Summary, AI recap, PDF/report layout, analytics, or editing controls.

## Long-Name Handling
- Play scoring row player names are constrained to one line with ellipsis.
- Team, Gross, Strokes, and Net columns remain visible on narrow iPhone layouts.
- Visual cleanup pass truncates names sooner to protect score controls and Stroke/Net columns.

## Hole Header Behavior
- The Play hole header now owns only hole-level facts: `Par X · SI Y`.
- Tee name and yardage were removed from the global hole header.

## Tee/Yardage Display Behavior
- Each player row now shows that player's tee and current-hole yardage.
- Combo tees use the hole-specific source tee when it can be resolved.
- Missing tee/yardage data fails gracefully by showing the available subset or omitting the subline.

## Nassau Display Behavior
- Nassau status only appears when Nassau is active.
- The live Play status uses the approved one-line format with positive leader-side values and `AS` for tied components.
- Nassau math and settlement logic were not changed.

## Strokes Display Behavior
- Players receiving no stroke on the current hole now show `—` instead of `0`.
- Handicap allocation logic was not changed.
- Visual cleanup pass abbreviates the Play scoring header to `Str` at all widths.

## Smart Score Advance QA Fix
- Visual QA found Smart Score Advance could fail after using the new score adjustment buttons.
- Root cause: the +/- button could retain browser focus, and the existing auto-advance timer guard treated any focused button as an active competing control.
- Fix: the timer now allows the matching score adjustment button for the same player while still refusing to auto-commit when another input, select, textarea, or unrelated button has focus.
- Scores still start blank, the first +/- interaction still initializes from par, direct numeric score entry remains available, timing presets are unchanged, and Stat Tracking ON/OFF rules are preserved.

## Stat Tracking Polish
- Tightened stat stepper spacing so Putts and Penalty plus buttons no longer crowd the number field on iPhone widths.
- The existing `Stat Tracking · Hole X` header and stat logic are preserved.

## Hole Selector Arrow Polish
- Added a clearer visual dropdown arrow to the hole selector without enlarging the selector or redesigning the header.

## Elapsed Time Behavior
- Added additive `roundTiming.startedAt` and `roundTiming.endedAt` metadata.
- New matches receive a start timestamp; finishing a round stores the end timestamp.
- Quick Scoreboard displays elapsed time only when valid start/end data exists.
- AI recap payload receives quiet round timing metadata for future storytelling.
- Older saved matches remain compatible.

## Shared Match Compatibility Statement
- Shared Match ledger, reconciliation, assignment, and final parity behavior from v30.3.50 were preserved.
- This release does not change Shared Match settlement or score-ledger comparison math.

## Safety Statement
- Scoring behavior, settlement behavior, Smart Score Advance behavior, and Shared Match reconciliation behavior were not intentionally changed.
- The Smart Score Advance QA fix restores the intended button-driven auto-advance path without changing scoring math, settlement math, score assumptions, or Shared Match reconciliation behavior.
- The Player Detail Games / Action QA pass changes display/visibility only and does not intentionally change scoring math, settlement math, Smart Score Advance behavior, or Shared Match reconciliation behavior.
- The final Player Detail scorecard QA fix changes display truth/styling only and does not intentionally change scoring math, settlement math, Smart Score Advance behavior, or Shared Match reconciliation behavior.
- The final Player Detail column-width fix changes Player Detail layout only and does not intentionally change scoring math, settlement math, Smart Score Advance behavior, Shared Match reconciliation behavior, or yardage logic.
- The final Player Detail first-hole alignment fix changes Player Detail layout only and does not intentionally change scoring math, settlement math, Smart Score Advance behavior, Shared Match reconciliation behavior, yardage logic, or tee/combo tee logic.
- The final Player Detail summary cleanup changes display only and does not intentionally change scoring math, settlement math, Smart Score Advance behavior, Shared Match reconciliation behavior, yardage logic, or tee/combo tee logic.

## Tests Added or Not Added
- No new unit tests were added.
- The display helpers live inside the existing browser-oriented `app.js` render layer, and the current Node test harness does not cleanly import those helpers without adding new test infrastructure.
- Existing shared-match, simulation, and live-engine tests were run to protect scoring, settlement, and reconciliation behavior.

## Validation Results
- `node --check app.js` - passed.
- `node --check service-worker.js` - passed.
- `node --check scripts/release-sanity-check.js` - passed.
- `node scripts/release-sanity-check.js v30.3.51` - passed with 7 PASS, 1 WARN, 0 FAIL. WARN is expected because the working tree has uncommitted release changes.
- `npm run release:sanity -- v30.3.51` - passed with 7 PASS, 1 WARN, 0 FAIL. WARN is expected because the working tree has uncommitted release changes.
- `git diff --check` - passed with line-ending normalization warnings only.
- `npm run test:shared-match` - passed. 8 tests passed.
- `npm run test:simulations` - passed. 3 tests passed.
- `npm run test:live-engine` - passed. 4 tests passed.
- `npm test` - passed. 15 tests passed.
- `npm run test:run` - passed. 15 tests passed through the npm test alias.
- `npm run simulate` - passed. 60 rounds, 0 failures, 42 warnings, 2 suspicious outcomes, 0 live-vs-mirror differences.
- `npm run simulate:100` - passed after report-write escalation. 110 rounds, 0 failures, 81 warnings, 2 suspicious outcomes, 0 live-vs-mirror differences.
- `npm run simulate:live` - passed after report-write escalation. 60 rounds, 0 failures, 42 warnings, 2 suspicious outcomes, 0 live-vs-mirror differences.
- `npm run simulate:compare` - passed after report-write escalation. 60 rounds, 0 failures, 42 warnings, 2 suspicious outcomes, 0 live-vs-mirror differences.

## Unavailable Validation Commands
- `npm run lint` - unavailable because `eslint` is not installed or available on PATH in this working copy.
- `npm run validate` - unavailable because `scripts/validate-release.js` does not exist in this working copy.
- `npm run test:money` - unavailable because `tests/money-math.test.js` does not exist in this working copy.

## Known Limitations
- No iPhone/browser visual automation was added.
- iPhone SE / narrow viewport acceptance was applied only to the touched Play tab areas; this was not a whole-app responsive redesign.
- Quick Scoreboard intentionally shows a compact subset and does not replace Scores or Match Summary.
- Elapsed time is metadata only; no live timer was added.

## Recommended Next Release
Recommended next release: v30.3.52 – iPhone Play Tab Acceptance and Visual QA.
