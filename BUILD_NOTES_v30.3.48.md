# BUILD_NOTES_v30.3.48.md

Build v30.3.48 - In-Round Player Insight & Scoring Comfort

## Release Theme
In-Round Player Insight & Scoring Comfort: give golfers a fast, read-only player detail view from the Play tab and make Smart Score Advance timing feel calmer.

## Objectives
- Add a premium read-only Player Detail View accessible by tapping a player name on the Play tab.
- Update Smart Score Advance timing presets to Fast 500 ms, Normal 750 ms, and Relaxed 1000 ms.
- Add a mandatory Pre-Codex Release Checklist to the Release Workflow documentation.

## Files Changed
- app.js
- index.html
- style.css
- docs/02_Release_Workflow.md
- package.json
- package-lock.json
- manifest.json
- service-worker.js
- BUILD_NOTES_v30.3.48.md

## Version Baseline Notes
- The checked-out branch was treated as the source of truth.
- Active source metadata contained stale v30.3.46 references in app.js, package.json, package-lock.json, manifest.json, and service-worker.js; these were updated to v30.3.48.
- index.html contained stale visible v30.3.44 version text; it was updated to v30.3.48.
- BUILD_NOTES_v30.3.47.md was not present in the repository.
- The Simulation Lab output still reports its internal label and seed as v30.3.46; this appears to be pre-existing simulation harness metadata, not an app version regression.

## Player Detail View Summary
- Player names on the Play tab now open a read-only in-round Player Detail modal.
- The modal uses current in-memory match data and does not save, navigate, edit scores, display settlement, or invoke AI recap behavior.
- The header shows player name, gross score, net score when applicable, score versus par, through-hole status, and match status when a relevant Match Play-style game is active.
- The Classic Scorecard renderer now supports a narrow read-only single-player mode while preserving the existing multi-player scorecard behavior elsewhere.
- Hole-by-hole statistics and stat totals reuse existing stat tracking data and helpers.
- Closing the modal returns directly to the Play tab scoring state.

## Smart Score Advance Timing
- Fast: 500 ms.
- Normal: 750 ms.
- Relaxed: 1000 ms.
- No Custom timing UI or Player Preferences were added.

## Release Workflow Documentation
- docs/02_Release_Workflow.md now includes a Pre-Codex Release Checklist.
- The checklist explains the process exists to prevent branch confusion, prevent merge conflicts, isolate releases, maintain clean release history, and make Codex safer and more predictable.

## Validation Commands Run
- `node --check app.js` - passed.
- `node --check service-worker.js` - passed.
- `git diff --check` - passed; Git reported line-ending normalization warnings only.
- `npm run simulate` - passed; 60 rounds, 0 failures, 47 warnings, 1 suspicious outcome.
- `npm run simulate:100` - initially blocked by sandbox report-write permissions, then passed after escalation; 110 rounds, 0 failures, 87 warnings, 1 suspicious outcome.
- `npm run test:simulations` - passed.
- `npm test` - passed.
- `npm run test:run` - passed.
- Stale active-version search for v30.3.46 / v30.3.47 / 30.3.46 / 30.3.47 in active app metadata and docs - passed.

## Failed Commands and Reasons
- `npm run simulate:live` - failed because the script is not defined in package.json.
- `npm run simulate:compare` - failed because the script is not defined in package.json.
- `npm run test:live-engine` - failed because the script is not defined in package.json.
- `npm run lint` - failed because `eslint` is not installed or available on PATH in this working copy.
- `npm run validate` - failed because `scripts/validate-release.js` does not exist in this working copy.
- `npm run test:money` - failed because `tests/money-math.test.js` does not exist in this working copy.

## Manual Acceptance Checklist
Player Detail View:
- Create a normal round.
- Open Play tab.
- Tap Player 1 name.
- Confirm Player Detail View opens.
- Confirm header summary is correct.
- Confirm only that player is displayed.
- Confirm Classic Scorecard appears.
- Confirm horizontal scrolling matches Scores tab behavior.
- Confirm hole-by-hole stats appear.
- Confirm totals appear.
- Confirm Close returns to scoring.
- Repeat for all players.
- Test incomplete round.
- Test completed round.
- Test Shared Match visibility if practical.

Smart Score Advance:
- Confirm Fast = 500 ms.
- Confirm Normal = 750 ms.
- Confirm Relaxed = 1000 ms.
- Confirm scoring behavior otherwise unchanged.

Release Workflow:
- Confirm docs/02_Release_Workflow.md contains the Pre-Codex Release Checklist.

## Known Limitations
- Manual iPhone, completed-round, incomplete-round, and Shared Match acceptance testing still need Product Owner verification.
- Player Detail shows stat detail only for players with existing stat tracking enabled; it does not invent or infer stats.
- The simulation harness still carries stale v30.3.46 internal report metadata.

## Recommended Next Release
Add live-engine validation scripts or wire the Simulation Lab to the live scoring module so required `simulate:live`, `simulate:compare`, and `test:live-engine` commands can run in future releases.
