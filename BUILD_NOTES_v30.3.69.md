# The Dye Ledger v30.3.69 — Product Experience Polish

## Release intent

This release reduces cognitive load through hierarchy, consistency, and progressive disclosure. The Product Acceptance revision also exposes the Press Engine's existing press-of-press model and clarifies configuration semantics without changing scoring, settlement, Shared Match authority, RoundRecord, offline-first storage, or historical immutability.

## Completed work

- Removed the pre-entry **Today's Round / Round Snapshot** hero so setup begins directly with **Round Setup**.
- Standardized **Round Setup**, **Advanced Options**, and **Pre-Round Checklist** section headers.
- Renamed **Playing Handicap Preview** to **Player Handicap Preview**.
- Grouped game selection into **Nassau & Match Play**, **Stroke & Hole Games**, and **Specialty Games** without changing game behavior.
- Expanded Player Preferences with Scoring Preferences and every Press default. New rounds inherit those defaults; round-specific overrides remain isolated to the round.
- Defined **Maximum Presses** as the round-wide total of original Presses and Re-Presses, and replaced **Maximum Depth** with golfer-facing **Maximum Re-Presses**.
- Updated the Play Press chooser to list every eligible root Press and Re-Press opportunity before confirmation.
- Kept Smart Score Advance, Stat Tracking, Shared Match, and Scoring Control behind the closed **Advanced Options** disclosure.
- Changed primary finalization copy and accessibility labeling from **Create Match** to **Start Round** without changing finalization behavior.
- Consolidated Library course-management styling and established `branding/app-icon-master.png` as the canonical app identity across app and PWA surfaces.
- Added platform-appropriate **Install App** behavior for native prompts and iPhone Share → Add to Home Screen guidance.
- Added focused regression coverage for preference inheritance, round-wide Press limits, Re-Press limits, opportunity presentation, terminology, grouped games, and branding.
- Replaced the temporary two-control player picker with one accessible searchable combobox per slot. It opens the full saved-player list, filters while typing, supports touch/mouse/Arrow/Enter/Escape, disambiguates duplicate names, preserves invalid or dismissed assignments, and never relies on modal active-slot state.
- Removed Press Stake choices from More and Round Setup. Every newly created Press and Re-Press now resolves the original game or Nassau-segment wager; legacy active wagers and frozen history remain untouched.
- Fixed false Pre-Round Checklist warnings. Removing the Round Snapshot also removed its DOM target, causing `renderTodaysMatchSummary()` to return before refreshing readiness; checklist and Start Round validation had also diverged into separate implementations. Both now consume one authoritative current-form/player/game draft contract.
- Made Shared Match On/Off handling surgical: only shared mode, shared scoring mode, and transport status change. Course, tees, players, teams, games, wagers, Press configuration, preferences, templates, and other setup values are preserved.
- Standardized Round Setup, Advanced Options, Pre-Round Checklist, Players & Teams, Games, and Match Templates heading hierarchy.
- Strengthened Team labels, aligned Player Handicap Preview descriptions left and numeric columns centrally, and displayed Allowance with a visual `%` suffix while retaining numeric percentage storage.
- Added **Round Defaults → Shared Match default** to the versioned Player Preferences schema. It defaults Off, is additive within schema v2, seeds only standard new drafts, yields to source/template/current-round values, and is never transported through Shared Match.
- Simplified ready-state copy to **Ready to Play** plus a completed-check count and warning-state copy to **Review Setup** plus an attention count. Optional location/weather context remains informational and does not block readiness.
- Made Start Round / Update Match the green primary action, balanced Cancel as a same-size secondary action, and removed the inaccurate editability statement.
- Moved routine Play Shared Match diagnostics into an expandable compact status pill near the Scoring Input heading. Detailed connection, parity, sync, role, and assignment information remains available on demand; the bottom panel now appears only for applicable scoring-visibility controls.
- Renamed the Library archive section to **Rounds** and standardized independent disclosures: Rounds starts expanded, Courses and Players start collapsed, and Session Summary is hidden when no active session exists.
- Kept **Download Cloud Courses** and **Publish Local Changes** only in **Course Actions**, while retaining one compact course-list status line. Manual entry actions now read **Add Course Manually** and **Add Tee Manually**.

## Final smoke-test remediation

- Moved the complete course-management surface inside the single **Courses** disclosure: search and saved courses, compact cloud status, Course Actions, scorecard import and AI analysis, manual course entry, manual tee entry, edit/delete paths, and the sole Download/Publish controls now collapse and expand together.
- Fixed the saved-player pointer-selection defect at its event-ordering source. After filtered text changed, pressing an option blurred the input; the delegated input `change` handler closed the option list before the later `click` event could reach that option. Delegated `pointerdown` now selects before blur and prevents premature dismissal.
- Routed pointer/touch, click fallback, and keyboard Enter through one slot-validating `selectPlayerComboboxOption` helper. The existing assignment function remains authoritative for draft/team/tee updates and immediate handicap, Games, summary, and checklist refreshes.
- Promoted **Round Actions** to an accessible `h2` with explicit white, bold, responsive, left-aligned styling inside the unchanged dark-green action card.
- Added focused regression coverage for Courses ownership and disclosure independence, unique IDs/cloud-action counts, executable mouse/touch selection, single-assignment behavior, repeated rerender cycles, slot isolation/replacement/duplicate rejection, shared pointer/click/Enter routing, refresh behavior, and Round Actions semantics/style.
- Remaining manual QA: physical iPhone touch selection, desktop mouse/trackpad selection, rendered disclosure collapse/expand, and Start Round/Update Match/Cancel confirmation on supported devices.

## Final QA remediation compatibility

- Existing active Press records retain their already-saved `wagerAmount`.
- New Presses and Re-Presses ignore legacy parent-stake configuration and use the selected root game or Nassau-segment wager.
- Frozen RoundRecords, historical Press transactions, completed rounds, and historical Shared Match metadata are not migrated or recalculated.
- Shared Match authority remains host-controlled; this pass adds no joined-device Press capability.

## Validation summary

| Check | Result |
| --- | --- |
| `node --check app.js` / `service-worker.js` | Pass |
| Focused final smoke, acceptance, course, preferences, and mobile tests | 60 passed, 0 failed |
| `npm test` | 156 passed, 0 failed |
| `npm run test:run` | 156 passed, 0 failed |
| `npm run simulate` | 60 rounds, 0 failures, 60 exact live/mirror matches |
| `npm run simulate:live` | 60 rounds, 0 failures, 60 exact live/mirror matches |
| `npm run simulate:compare` | 60 rounds, 0 failures, 0 live/mirror differences |
| `npm run simulate:100` | 110 rounds, 0 failures, 110 exact live/mirror matches |
| `npm run release:sanity -- v30.3.69` | 8 pass, 1 expected dirty-worktree warning, 0 fail |
| `git diff --check` | Pass |
| `npm run lint` | Unavailable: command failed because the declared `eslint` executable is not installed in this checkout |

All four exact simulation commands completed successfully, including intentional regeneration of `reports/simulation/latest-summary.md`; the retained report is the final 110-round compare run. The established advisory counts remain 42 warnings plus one suspicious marker for 60-round runs and 79 warnings plus one suspicious marker for the 110-round run; there were no failures or live/mirror differences.

Rendered in-app browser QA completed against an uncached localhost origin at desktop and 320-pixel width. The final smoke pass verified that closed Courses hides all management controls, expanded Courses reveals them, Rounds and Players remain independent, and only one Download/Publish action exists. A real browser pointer click selected a filtered player, updated only the intended slot, and closed the list. At 320 pixels, there was no horizontal overflow and Round Actions computed to white, 20px, weight 850, and left aligned. Physical iPhone/Safari touch and multi-device Shared Match QA remain open.

## Manual QA checklist

- [ ] On desktop and iPhone, open each player combobox, type partial names, select by touch/mouse/keyboard, replace one player, dismiss invalid text, and verify only the intended slot changes.
- [ ] Verify Team labels, Player Handicap Preview alignment, tee/handicap recalculation, and Allowance `100%` presentation without page overflow.
- [ ] Change Shared Match default, reload, verify the next standard new round inherits it, and verify current/source/template rounds retain their explicit value.
- [ ] Confirm Ready to Play / Review Setup copy and counts remain consistent with Start Round; denied location remains optional.
- [ ] Verify Start Round, Update Match, and balanced secondary Cancel behavior.
- [ ] In a Shared Match, expand the compact Play status for diagnostics and confirm no routine expanded panel appears near Add Memory.
- [ ] Verify Rounds, Courses, Players, and Session Summary disclosure/empty-state behavior plus the single Course Actions cloud-control set.
- [ ] Desktop and mobile Match setup begin directly with Round Setup; no Today's Round / Round Snapshot hero appears.
- [ ] Game selection shows the three accepted groups and every game retains its existing behavior.
- [ ] Player Handicap Preview opens and calculates exactly as before.
- [ ] Player Preferences shows Scoring Preferences and every Press Preference with the accepted helper text.
- [ ] A new round inherits every Press preference; changing a Round Setup override does not change Player Preferences.
- [ ] Maximum Presses blocks the next wager after the round-wide total is reached across games, segments, and Re-Presses.
- [ ] Maximum Re-Presses permits only the configured number of descendants in an individual Press chain.
- [ ] Press opens a chooser containing all eligible root Press and Re-Press opportunities and creates nothing before confirmation.
- [ ] Advanced Options starts closed and retains preference-derived Smart Score Advance and Stat Tracking defaults.
- [ ] Pre-Round Checklist emphasizes missing items and collapses successful validations.
- [ ] Start Round finalizes a local round exactly once; editing retains Update Match semantics.
- [ ] Shared Match host/join authority, synchronization, scoring, and settlement remain unchanged.
- [ ] Completed rounds, frozen reports, and exported RoundRecords remain immutable.
- [ ] Library, canonical branding, install guidance, and offline launch retain the v30.3.69 polish behavior.

## Known limitations

- Native install-prompt availability is browser-controlled and cannot be forced.
- iPhone installation detection relies on standalone display mode because Safari exposes no before-install prompt.
- Joined Shared Match devices still cannot request Press approval; authoritative creation remains host-only.
- Broad Press void/supersede management UI, automatic creation, and custom/double stakes remain deferred.
- Physical iPhone/Safari, desktop cross-browser, and multi-device Shared Match QA remain required before production release.
- Lint remains unavailable until the declared development dependency is installed in the checkout.

## Release readiness recommendation

**Ready to commit after review; not yet production-ready.** All available executable acceptance tests, syntax checks, simulation engines, release sanity checks, desktop pointer QA, and 320-pixel rendered checks pass. Physical iPhone/Safari touch and the broader device/browser checklist remain required before production release.
