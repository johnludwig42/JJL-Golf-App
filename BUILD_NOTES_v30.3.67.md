# v30.3.67 – Press and Quick Scoreboard Cleanup Hotfix

## Release theme

Fix regressions first. Reuse trusted components. Preserve game truth.

## Defects corrected

- Restored contextual Press visibility for eligible local Nassau and Match Play rounds, Shared Match hosts, mobile, desktop, and saved/reloaded active matches.
- Active rounds now say **Provisional Settlement** and use “would pay”; formally completed and frozen rounds say **Final Settlement** and use “pays.”
- Blank team names now display deterministic player-first-name labels across shared team-label call sites, with last-name initials and narrow ordinal distinctions for collisions.
- The header and Apple touch icon now use the canonical existing `apple-touch-icon-v4.png` brand asset, with `icon-192-v4.png` retained as the header fallback and installed-PWA icon.
- Quick Scoreboard now contains collapsed Score Distribution between Player Score Summary and Classic Scorecard, using existing score-distribution calculations and presentation.
- Score Distribution keeps wide content inside its own horizontal scroll panel. Quick Scoreboard and Scores now share more of the same Classic Scorecard renderer and wrapper structure, but Quick Scoreboard horizontal scrolling remains unresolved.
- Momentum charts now fit their containing cards without the prior 500px minimum width or normal horizontal scrolling.
- Quick Scoreboard Classic Scorecard now uses the existing scorecard wrapper as its intended horizontal scroll owner. Automated structural checks pass, but manual iPhone and desktop QA confirms that physical horizontal scrolling still does not work.
- Play-tab Greenie selection is materially shorter through scoped spacing and checkbox sizing while preserving the existing checkbox markup, 44px row targets, names, helper copy, ordering, authority, and event handling.
- Desktop Play now renders a bounded Match Summary from the existing `buildFeaturedMatchStatus` component while retaining the shared current-hole scoring path and adjacent Scoreboard/Press actions.
- Player Score Summary now includes the authoritative current Postable Score from `computeMatchMetrics().postableTotal`; frozen summaries use the existing RoundRecord `players[].postable` value. Missing or untrusted values render as an em dash.
- Quick Scoreboard and the Scores-tab Player Leaderboard now share one stable-ID player-row builder, one ranking path, and one responsive semantic table renderer. The Scores heading remains Player Leaderboard while Quick Scoreboard remains Player Score Summary.
- Quick Scoreboard Classic Scorecard now renders the same native `.scorecard-wrap` used by Scores, with shared table-width and keyboard-region structure. This structural consolidation did not deliver working physical scrolling in Quick Scoreboard.
- Provisional and Final Settlement now consume the complete payout ledger including eligible Press contributions before standard netting. Stable Press IDs deduplicate repeated records, and frozen history continues to consume authoritative frozen net transactions without combining the separate Press audit layer.

## Press regression root cause and correction

Two compatibility/render gaps combined to hide otherwise valid opportunities. Runtime visibility read only selected-game top-level Press fields, while legacy Nassau matches could retain enabled configuration at match level or under nested `pressConfig`. In addition, visibility rendered before current-hole inputs, allowing stale values from the prior hole to trigger `BEFORE_HOLE_STARTED` suppression.

`getPressConfigForGame()` now merges legacy match-level Nassau, nested game, and top-level game configuration with explicit game fields winning. Play renders score inputs before evaluating contextual Press visibility. Confirmation-time revalidation is unchanged and remains authoritative; the first tap creates nothing.

## Settlement lifecycle

Lifecycle—not raw hole count—controls the hero. A frozen RoundRecord or a match with both `status === 'complete'` and `completedAt` is final. Active, incomplete, all-scores-entered-but-not-ended, and reopened working copies are provisional. The hero now receives active Press preview contributions and final Press contributions from the same complete payout context used elsewhere; payment optimization and final Press settlement math remain unchanged.

## Final completion-pass root causes

- **Player summary:** Quick Scoreboard and Scores independently rendered overlapping player tables. Both already had access to trusted `postableTotal`, but only Scores displayed it.
- **Classic Scorecard scrolling:** both surfaces used the same scorecard renderer, but Quick Scoreboard added a second overflow wrapper plus Quick-specific overflow overrides, while a later Scores-only mobile selector increased the table minimum width. The completion pass consolidated more of that structure, but manual QA demonstrates that this diagnosis and structural change were not sufficient to restore physical scrolling.
- **Press settlement:** the hero correctly consumed `getPayoutReportContext().finalTotals`; the omission occurred earlier because `computeLivePayoutGames()` only admitted Press payout games in `FINAL/HALVED` state. The Press row's active projection therefore had no corresponding provisional ledger contribution.

The structural scorecard change removes the duplicate overflow wrapper and applies the mobile scorecard width to the shared table. Automated source/markup tests pass, but the user-visible scrolling defect remains open and is deferred to a later focused fix. Separately, the existing Press settlement shape can produce an explicitly requested active preview before normal payout-game aggregation. Final, frozen, halved, incomplete, voided, and superseded lifecycle rules remain intact.

## Team fallback naming

`getTeamDisplayName()` preserves any nonblank explicit team name. Otherwise it uses stable match-player slot order and joins first names with `/`. Duplicate first names expand to last initials (for example `John S./John J.`); remaining exact collisions receive deterministic narrow ordinals. The helper is display-only and does not mutate `teamNames` or identity fields.

## Files changed

- `app.js`
- `index.html`
- `manifest.json`
- `service-worker.js`
- `style.css`
- `package.json`
- `package-lock.json`
- `tests/press-engine-implementation.test.js`
- `tests/press-engine-design.test.js`
- `tests/mobile-scoring-ux.test.js`
- `docs/PRESS_ENGINE_ARCHITECTURE.md`
- `BUILD_NOTES_v30.3.67.md`

## Tests added or expanded

- Legacy/local Nassau Press visibility and save/reload normalization.
- Nested configuration and local-authority behavior.
- Active, completed, frozen, and reopened settlement language with unchanged totals.
- Explicit, blank, whitespace, one-player, duplicate-first-name, and exact-name team labels without helper mutation.
- Quick Scoreboard section order, collapsed Score Distribution, shared Classic Scorecard structure, responsive Momentum, canonical logo source, desktop summary reuse, and Press render ordering. These automated checks do not establish working physical scorecard scrolling.
- Trusted active, completed, and frozen Postable values; unavailable-value dashes; long and duplicate names; stable IDs; shared Quick/Scores markup; preserved ranking; and source immutability.
- Structural 9-hole and 18-hole scorecard checks: direct shared wrapper, bounded modal child, 920px mobile table width, keyboard region, final-column retention, and collapsed disclosure. Manual iPhone/desktop QA still fails horizontal scrolling.
- Provisional, final, and frozen Press-inclusive settlement; base-plus-Press reconciliation; stable-ID duplicate suppression; multiple Nassau and standalone Match Play Presses; team allocation; and halved, incomplete, voided, and superseded exclusions.

## Validation results

- `node --check app.js` and `node --check service-worker.js`: passed.
- Focused Press, player-summary, scorecard, settlement, mobile, report, Shared Match, RoundRecord, and SSP suites: 97/97 passed.
- `npm test`: 120/120 passed.
- `npm run test:run`: 120/120 passed.
- `npm run simulate`, `simulate:live`, and `simulate:compare`: 60 rounds each, zero failures, 60 exact live/mirror matches, zero differences.
- `npm run simulate:100`: 110 total rounds, zero failures, 110 exact live/mirror matches, zero differences.
- Simulations retain the established warnings and one suspicious-outcome flag; no new mismatch or failure was reported.
- `npm run release:sanity -- v30.3.67`: 8 PASS, one expected dirty-working-tree warning, zero FAIL.
- `git diff --check`: passed.
- `npm run lint` was attempted but is unavailable because the local `eslint` executable is not installed; dependencies were not installed or changed.

## Manual QA checklist

- Logo: inspect desktop/iPhone header, favicon, bookmark, and installed PWA for the v4 mark and stable header sizing.
- Press: verify local Nassau and Match Play on desktop/iPhone; untouched active hole; save/reload; Shared Match host versus joined device; touched hole; duplicate and limit denial; first tap opens only the card; confirmation creates exactly once.
- Settlement: verify 3/18 and 3/9 are provisional; formal and early finish are final; reopened is provisional; frozen history is final; confirm “would pay” versus “pays.”
- Team names: verify blank, explicit, duplicate-first-name, exact-name, one/two/three-player teams across Play, Quick Scoreboard, Momentum, Scores, Shared Match, Press, audit, and reports.
- Quick Scoreboard: preserve the confirmed failure case for the later focused fix—on iPhone and desktop, expand Classic Scorecard and verify that horizontal scrolling currently does not move to the Back 9 or Total columns.
- Desktop Play: verify current-hole data, player scoring, bounded Match Summary, Scoreboard, contextual Press, sticky navigation, and no duplicate business logic.
- Historical: verify frozen values, Final Settlement including any final Press, and no snapshot mutation.
- Player summary: compare Quick Scoreboard with Scores; verify Gross, Net, Net +/-, and Postable match; test long and duplicate names; confirm missing scores remain dashes.
- Press settlement: verify base win plus Press win, base loss offset by Press win, opposite Press winners, multiple components, repeated open/close and Shared Match sync, and frozen historical totals without duplication.

## Known limitations and deferred items

Live press-of-press declaration UI, broad void/supersede UI, joined-device requests, automatic creation, custom/double stakes, Hammer, unlimited depth, and broad Play redesign remain deferred. Shared Match Press capability also remains subject to a later focused end-to-end iteration across host creation, joined-device receipt, repeated synchronization, lifecycle authority, and settlement reconciliation. Desktop parity uses a reused summary component rather than a new two-column rendering engine.

Quick Scoreboard Classic Scorecard horizontal scrolling is a known v30.3.67 limitation. Quick Scoreboard and Scores share more of the same structure and automated structural tests pass, but manual iPhone and desktop QA confirms that physical horizontal scrolling still does not work in Quick Scoreboard. Successful scrolling was not delivered in this release and is deferred to a later focused fix.

No scoring, handicap, Nassau, Match Play, Skins, Net Skins, SSP, Greenies, settlement, or reconciliation math was changed. No dependencies were added. Codex did not commit, push, merge, or create a pull request.
