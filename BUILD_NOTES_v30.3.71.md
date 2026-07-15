# The Dye Ledger v30.3.71 – Press Completion & Regression Hardening

Release theme: **Prove Every Press**

## Scope

This focused release completes regression hardening for the existing Press system. It does not redesign Presses, add a new game, change navigation, or alter gross/net/handicap/settlement mathematics. It preserves the v30.3.70 local-first persistence, recovery, Shared Match, service-worker, and frozen-history behavior.

## Press availability matrix

Deterministic coverage exercises Nassau Front, Back, and Overall plus standalone Singles and Team Match Play parents across enabled/disabled state, all square, trailing-side authority, open/clinched parent policy, first and last future hole, no future hole, duplicate start, round-wide capacity, Re-Press depth, host/joined authority, chooser rerender, reload, and repeated authoritative merge.

The Press action appears only when at least one fully eligible opportunity exists. Opening the chooser and rerendering create nothing. Confirmation revalidates the current scoring position and creates exactly one stable record.

## Mid-round editing policy

- Presses may be enabled before scoring or during an active round. Eligibility begins at the current live state and never creates a retroactive Press.
- Presses may be disabled before any Press exists.
- Presses cannot be turned off after a Press has been created. The UI is locked with concise helper text, and the save path returns `PRESS_DISABLE_BLOCKED_EXISTING_PRESS`.
- Maximum Presses may increase or equal the total number of created root Presses and Re-Presses. A lower value returns `MAX_PRESSES_BELOW_EXISTING_COUNT`.
- Maximum Re-Presses may increase or equal the deepest existing descendant chain. A lower value returns `MAX_REPRESSES_BELOW_EXISTING_DEPTH`.
- A selected parent game with Press activity cannot be removed and returns `PRESS_SETTING_LOCKED_AFTER_PRESS`.
- Trigger, prompt threshold, declaring-side rule, parent availability, declaration timing, and Nassau lane toggles may change for future opportunities only. Existing Press IDs, ranges, basis, wager, status, and settlement components remain unchanged.
- Joined Shared devices cannot edit authoritative Press settings and receive `JOINED_DEVICE_NOT_AUTHORIZED`. The host remains authoritative.
- Round-specific editing does not modify Player Preferences.

## Original wager hardening

A Re-Press now inherits the stored root Press wager. This closes the mid-round-edit gap where rereading a subsequently edited base-game stake could change a new descendant's amount. Legacy records without a usable stored root wager retain the existing selected-parent fallback. Existing records and frozen transactions are not migrated or rewritten.

## Shared Match, persistence, and history

Stable Press IDs, host-authoritative lifecycle precedence, and deterministic opportunity deduplication preserve Press trees across serialization, reload, repeated sync, offline/reconnect merge, Finish, interrupted-finish recovery, reopen, refinish, and frozen history. Joined devices remain display-only for Press declaration and configuration. Play Another Round starts with no Press records or frozen snapshot.

## Settlement and Press Activity audit

Press settlement remains a separate child-game contribution included exactly once in the existing zero-sum payout pipeline. Halved, incomplete, voided, and superseded Presses do not move money under the existing rules. Frozen `transactions` remain authoritative; `pressTransactions` remain audit-only and are never added back into the net ledger.

The existing completed-round Press audit is refined as **Press Activity**. It reads live authoritative facts or cloned frozen RoundRecord facts and shows the parent/segment label, Press or Re-Press depth, declaration hole, hole range, original wager, final status, and winner/halved result. Rounds without Presses omit the section. Rendering is read-only and does not recalculate or mutate frozen settlement.

## Icon consistency

The top-left header image and the single Apple touch icon link both use `branding/apple-touch-icon.png`. No branding image bytes changed. The 192 px and 512 px PWA artwork, favicons, splash behavior, and other branding assets remain visually unchanged; only desktop manifest/favicon resource URLs and their matching precache entries gained v30.3.71 cache revisions. Existing iPhone Home Screen icons may remain cached until the app is removed and re-added from Safari.

### Final Quick Scoreboard and computer-icon remediation

Quick Scoreboard Classic Scorecard already reused the production `scorecard-wrap` and sticky scorecard cells, but its Quick-specific bounds did not share an explicit scroll-region contract or focus treatment. Score Distribution had the more direct defect: `quick-scroll-panel` and `score-distribution-scroll` both declared horizontal overflow. The outer wrapper could become the measured scroller while the sticky Player column remained scoped to the inner wrapper, so the Player column moved away and disclosure width varied after open/close.

Both tables now use one `table-scroll-region` contract: a bounded `min-width:0` container with native horizontal overflow, touch momentum, contained overscroll, keyboard focus, visible focus, and an accessible label. Classic Scorecard retains the same proven scorecard table, sticky Player/Team cells, 1080 px desktop table width, and 920 px narrow-screen width. Quick-specific fixed descriptive-column widths prevent long player or team names from expanding the table. Score Distribution removes the redundant outer overflow wrapper, gives numeric columns minimum widths, and keeps a bounded, ellipsized 164 px Player column sticky within the actual scroller. The modal, backdrop, body, disclosure, and table wrappers explicitly remain horizontally bounded.

The computer icon investigation separated the header, desktop installed PWA, and browser favicon surfaces. The header and Apple link both directly reference `branding/apple-touch-icon.png`, with no fallback, mask, or alternate CSS artwork. `app-icon-512.png` is byte-identical to the approved master, and the 192 px and 180 px files are valid same-artwork derivatives. The old computer appearance is therefore a stale manifest/favicon/operating-system cache issue rather than different active artwork. Desktop manifest icons and favicon links now use v30.3.71 query URLs, with matching service-worker precache entries; no branding image bytes changed. An already installed desktop PWA may still require uninstall/reinstall, while browser favicons and iPhone Home Screen icons have separate caches.

### Final player assignment and tee independence remediation

Player and tee controls now behave as independent slot fields. A saved player can be assigned before its tee, a tee can be selected before its player, and mixed-order assignment remains stable across rerenders, replacements, team-count changes, Shared Match setup, and setup-draft reload. Explicitly blank tees are no longer silently replaced by the reference/default tee. The trusted course default still initializes a newly enabled slot, while later user choices—including clearing a tee—remain authoritative. Replacing a player preserves a valid existing tee and clears an invalid tee; unrelated slots are not rewritten.

The pre-round checklist and Start Round validation now consume the same per-slot facts. Unassigned player slots are reported under Players, while an assigned player with a missing or unavailable tee receives an exact team/player-slot tee warning. Completed slots stay complete. Incomplete drafts persist rows containing either a player or a tee, so player-first and tee-first work can be resumed safely without creating partial rounds or changing host authority.

`tests/player-tee-order-independence.test.js` covers the required player-first, tee-first, mixed, replacement, team-change, Shared Match, reload, accessibility, and no-forced-focus sequences. Its deterministic stress matrix executes 180 varied setup sequences across team sizes, ordering patterns, duplicate prevention, duplicate/long names, handicap values, clear/reassign operations, partial validation, and final readiness.

## Tests and deterministic fixtures

`tests/press-completion-regression.test.js` adds:

- the complete Press-edit reason-code contract;
- Off/On and On/Off mid-round transitions;
- equal/increased/rejected count and depth limits;
- future-only setting preservation;
- Nassau Front/Back/Overall and standalone parent availability;
- all-square, no-future-hole, limit, duplicate, host, and joined cases;
- stored-root-wager inheritance;
- reload, authoritative merge, Finish, reopen, refinish, next-round reset, and stable transaction coverage;
- frozen Press Activity audit correctness, immutability, idempotency, and settlement neutrality;
- active icon, cache, asset-integrity, and branding-documentation assertions.

Existing Press design/implementation, Shared Match, production readiness, RoundRecord, payout, simulation, and product regression suites remain enabled.

`tests/quick-scoreboard-scroll-remediation.test.js` adds active and frozen 9/18-hole coverage for the shared single-scroll-owner contract, modal/grid bounds, sticky Player/Team columns, long names, final columns, disclosure immutability, keyboard scrolling, canonical icon provenance, PNG dimensions/hashes, versioned desktop icon resources, and cache documentation.

## Validation results

- `node --check app.js` — PASS.
- `node --check service-worker.js` — PASS.
- `npm test` — PASS, 186/186 tests, 0 failures.
- `npm run test:run` — PASS, 186/186 tests, 0 failures.
- Focused player/tee, final-QA, production-readiness, mobile, Press, and Quick Scoreboard suites — PASS, 45/45 tests, 0 failures.
- `npm run simulate` — PASS, 75 rounds (25 fixtures + 50 random), 0 failures, 75 exact live/mirror matches, 58 advisory warnings, 1 suspicious high-value settlement marker.
- `npm run simulate:live` — PASS with the same 75-round result.
- `npm run simulate:compare` — PASS with the same 75-round result.
- `npm run simulate:100` — PASS, 125 rounds (25 fixtures + 100 random), 0 failures, 125 exact live/mirror matches, 96 advisory warnings, 2 suspicious high-value settlement markers.
- `npm run release:sanity -- v30.3.71` — PASS, 8 checks passed, 0 failed, 1 expected warning for the intentionally modified working tree.
- `git diff --check` — PASS; Git emitted line-ending conversion advisories only.
- Rendered responsive QA — PASS at 320 × 700 and 1280 × 800: modal/document widths remained bounded; Classic Scorecard and Score Distribution each had one internal scroll owner; trackpad-style horizontal input reached Total/Other; sticky Player/Team columns remained anchored; and repeated close/open cycles preserved the layout and scroll positions. A second production-shell check at 390 × 844 also had no horizontal page overflow, confirmed matching header/Apple icon references, and recorded 0 console errors. The final assignment check used a fresh v30.3.71 origin at 1280 × 720: player assignment with an explicitly blank tee succeeded without forced tee focus, the blank remained selected, exact slot-labelled checklist copy appeared, the helper and unique accessible control labels rendered, duplicate DOM IDs were absent, and document width stayed bounded.
- `npm run lint` — unavailable: the configured `eslint` executable is not installed. No dependency was installed or changed to run lint.

The intentionally regenerated `reports/simulation/latest-summary.md` records the final 125-round compare run. Its advisory warnings are established early-clinch and incomplete/provisional notices. Its two suspicious markers are settlement rows above $100 in `blowout_match_play` and seeded `random_056`; both remain zero-sum and produce no live/mirror difference.

## Known limitations

- Joined devices cannot declare or approve Presses and cannot edit authoritative Press settings.
- Automatic Press creation, custom/doubled stakes, Press Center/timeline, and broad management UI remain deferred.
- Physical two-device disconnect/reconnect and installed-iPhone cache behavior still require device QA.
- Existing iPhone Home Screen artwork can remain cached until the prior installation is removed and re-added.

## Manual QA

- Create Nassau with Presses enabled, produce a down state, open the chooser, and verify opening creates nothing while confirmation creates one future-hole Press.
- Start with Presses Off, score several holes, enable Presses, and confirm only current/future opportunities appear.
- Create a Press and confirm Presses cannot be disabled in Edit Match.
- Create a Re-Press chain; reject limits below current usage/depth and allow equal or higher limits.
- Refresh and close/reopen the PWA; confirm IDs, parents, ranges, and wagers persist once.
- On two devices, create from the host, sync repeatedly, disconnect/reconnect, and verify the joined device displays each Press once with matching provisional/final settlement.
- Finish, inspect Press Activity, reopen, refinish, and confirm the prior frozen snapshot remains in history.
- Remove and re-add the installed iPhone app and confirm the Home Screen icon matches the top-left in-app artwork.

## Scope confirmation

No unrelated product feature, navigation change, new game, dependency upgrade, authentication, or cloud identity was added. Codex did not commit, push, merge, or create a pull request.
