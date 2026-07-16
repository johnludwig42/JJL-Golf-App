# The Dye Ledger v30.3.73 - Library & Product Consistency

Release objective: make Library workflows clearer, visually consistent, accessible, and reliable across mobile and desktop without changing navigation, data architecture, or core product behavior.

## User-visible improvements

- Library now uses a clear page header and semantic section hierarchy for Rounds, Courses, Players, and the renamed Current Session surface.
- Rounds distinguish unfinished, active, saved, and completed states; separate identity from tee, format, result, progress, players, storage, and elapsed-time metadata; and use explicit Continue, View, eligible Reopen, Scorecard PDF, refresh, and Delete actions.
- Completed-round View no longer reopens a round. Reopen is a separate local/Shared-host action, and Shared joined devices cannot reopen the host's completed match.
- Courses identify device versus cloud-and-device availability, preserve location/tee metadata, keep Edit and Add Tee visible, and consolidate destructive choices under More actions.
- Deleting a saved tee no longer deletes saved rounds that reference it; the confirmation now explicitly preserves saved rounds and their course snapshots.
- Players show handicap index and saved-round usage, protect long display names, and distinguish Edit from Delete.
- Empty states now explain what is missing and the next useful action without adding new workflows.

## Shared consistency and accessibility

- Library and Quick Scoreboard disclosures share a chevron, expanded rotation, visible focus treatment, and at least 44 px touch targets; nested Library maintenance disclosures are at least 48 px.
- Library item actions have at least 44 px targets, visible focus states, responsive wrapping, and consistent destructive styling.
- Page, section, and subsection headings follow a logical `h2` / `h3` / `h4` hierarchy.
- Long course, round, and player names truncate safely while retaining the complete value through the title attribute or surrounding workflow.
- Metadata remains visually subordinate to the primary saved-record identity and does not rely on color alone.

## Responsive-layout improvements

- Library cards and action groups collapse to a single-column layout below 700 px and a two-column action grid at 390 px and below.
- Course overflow actions remain bounded to the viewport.
- Fresh-origin rendered checks at 320 x 720, 375 x 812, 390 x 844, 430 x 900, 768 x 900, 900 x 900, and 1280 x 720 found no clipped Library controls, unintended horizontal overflow, or visible controls below 44 px. Top-level disclosure targets measured 52 px; nested disclosure targets measured at least 48 px.

## Quick Scoreboard

- Native disclosures now use the same chevron, focus, spacing, and touch-target treatment as Library disclosures.
- No Quick Scoreboard game, calculation, settlement, state, or hierarchy logic changed.

## Validation

- `node --check app.js`: pass.
- `node --check service-worker.js`: pass.
- Focused Library/UI/Quick Scoreboard regression run: 33 passed, 0 failed.
- `npm test` and `npm run test:run`: 207 passed, 0 failed, 0 skipped.
- `npm run simulate`: 75 rounds, 0 failures, 75/75 exact live-to-mirror matches.
- `npm run simulate:live`: 75 rounds, 0 failures, 75/75 exact live-to-mirror matches.
- `npm run simulate:compare`: 75 rounds, 0 failures, 75/75 exact live-to-mirror matches.
- `npm run simulate:100`: 125 rounds, 0 failures, 125/125 exact live-to-mirror matches. The two suspicious high-value outcomes are simulation review flags, not invariant or adapter failures.
- `npm run lint`: unavailable because the valid, declared local ESLint executable is not installed in this checkout; no dependency was installed and no source lint failure was observed.
- The obsolete `test:money` package script was removed after repository history confirmed its referenced `tests/money-math.test.js` never existed. Money behavior remains covered by the simulation, mobile scoring, Press, SSP ledger, report-layout, and production-readiness suites.
- `git diff --check`: pass; Git emitted informational LF-to-CRLF working-copy warnings only.

## Scope protection and deferred items

- Navigation, Scores, identity/authentication, Course Library architecture, Round Course Snapshots, RoundRecord, settlement, Shared Match protocols, Press, SSP, and game logic were not redesigned.
- Physical iPhone PWA validation remains required for final production acceptance, including native keyboard disclosure activation, touch behavior, service-worker update lifecycle, and long-name fixtures with real saved data. Native `<details>` / `<summary>` behavior was retained without redundant custom key handlers.
- A live Quick Scoreboard was not created in the fresh-origin browser review because it requires an active match; its shared disclosure contract and generated markup are covered by automated tests and still require an active-match manual smoke test.
- Real saved-round continue/reopen, course persistence, player/roster persistence, and two-device Shared Match smoke testing remain on the Product Owner manual checklist; automated compatibility and exactly-once regression coverage passed.
- Broader Scores work remains deferred to v30.3.74. Identity, invite-only beta, usage tracking, and beta management remain deferred to v30.3.75.
