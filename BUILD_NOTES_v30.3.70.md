# The Dye Ledger v30.3.70 — Production Readiness & Stability

Release theme: **Trust the Round**

## Outcome

v30.3.70 hardens the existing product experience without changing its information architecture, navigation, scoring rules, or visual language. The release focuses on durable setup and scoring state, recoverable round completion, historical integrity, local-first Shared Match behavior, safe PWA updates, and support diagnostics.

## What changed

- Added a guarded persistence boundary for the primary state record, including structured failures, a last-known-good backup, corrupt-record filtering, duplicate match reconciliation, dangling active-round cleanup, and legacy-key fallback.
- Added debounced Match Setup draft persistence and recovery. Drafts retain setup choices but explicitly discard scores, Presses, completion state, and frozen history.
- Persisted the active scoring hole so a reload resumes at the golfer's last working position.
- Rebuilt Confirm Finish as a prepare/commit flow:
  - save the active round first;
  - derive completion and the frozen RoundRecord on a clone;
  - write an interruption marker;
  - durably write the completed state;
  - only then publish the completed state in memory and report success.
- Added deterministic startup reconciliation for an interrupted Finish. A durably completed record wins; otherwise the round remains active and editable.
- Reopen now copies the prior frozen RoundRecord into immutable superseded history before allowing edits. Re-finishing produces a new frozen result without silently destroying the prior one.
- “Play Another Round with This Group” continues to carry player/team identity while clearing scores, stats, games, Presses, summaries, frozen snapshots, and prior Shared transport credentials. A Shared next round receives fresh host transport identity.
- Shared Match creation now saves the local working round before attempting cloud upload. Offline cloud creation leaves a usable local round and an honest pending/local-cache sync state.
- Removed automatic service-worker activation during install. Updates wait for an explicit safe refresh, and the ordinary update action will not force a reload during setup or scoring.
- Added navigation network-first/offline fallback behavior and versioned static caching for v30.3.70.
- Added More → App Updates diagnostics for local storage, recovery result, last save/failure, active round, scored holes, Shared role/sync state, preference schema, and frozen RoundRecord state.
- Suppressed routine Match Finalization console output unless debug diagnostics are explicitly enabled; failures remain visible to developers.

- Completed the final focused remediation pass: validated Greeny/Prox now requires an explicitly user- or auto-confirmed putt count and automatically enables full-player stat coverage; Players & Teams and Games are accessible setup disclosures that reopen when checklist warnings need attention; Honors uses the Featured Match pill treatment on its own line; and the header now uses the iPhone Home Screen icon.
- Hardened saved-player assignment for large rosters by excluding players already used in other slots, treating duplicate plain names as ambiguous, resetting stale combobox state, and showing the full replacement list when a selected field is focused.

## Files changed

- `app.js` — persistence layer, setup recovery, active-round position, atomic Finish, reopen history, local-first Shared creation, diagnostics, and safe update gating.
- `service-worker.js` — waiting-worker activation, v30.3.70 cache, navigation recovery, and static cache behavior.
- `index.html` — v30.3.70 identity, cache-busting references, release note, and technical diagnostic fields.
- `manifest.json`, `package.json`, `package-lock.json`, `README.md` — version and release metadata.
- `tests/production-readiness-stability.test.js` — failure injection and recovery coverage.
- `tests/mobile-scoring-ux.test.js` — v30.3.70 cache identity expectation.
- `docs/PRODUCTION_READINESS_ARCHITECTURE.md` — persistence, lifecycle, recovery, sync, update, and diagnostic architecture.

- `tests/focused-reliability-remediation.test.js` — Greeny/Prox validation, disclosure/branding presentation, and 120-cycle deterministic player-selection stress coverage.

## Automated validation

Run from the repository root:

```text
node --check app.js
node --check service-worker.js
npm test
npm run lint
npm run validate
npm run release:sanity
npm run simulate:100
```

The production-readiness suite covers:

- localStorage quota/write failure without false completion;
- malformed primary JSON and last-known-good recovery;
- partially valid state and deterministic duplicate handling;
- interrupted Finish rollback/confirmation;
- setup draft reload and historical-state stripping;
- immutable Finish preparation and balanced frozen settlement;
- reopen history preservation;
- clean next-round derivation;
- safe service-worker activation and update gating;
- production diagnostic visibility.

Existing suites continue to cover Shared Match score reconciliation, SSP fact envelopes, Press idempotency and lifecycle, RoundRecord freezing, historical effective records, payout cross-footing, course snapshots, mobile scoring, preferences, reports, and deterministic simulations.

Focused coverage also executes 120 varied mouse/touch/pen and direct-selection cycles with replacements, clears, duplicates, duplicate names, long names, rerenders, tee/team preservation, and handicap invariants.

## Physical-device QA checklist

Complete these checks on an installed iPhone PWA and, where noted, a second device:

- [ ] Begin Match Setup, populate players/teams/course/settings, background or terminate Safari, reopen the installed app, and confirm the setup draft returns.
- [ ] Start a local round, save several holes, move to a non-sequential hole, terminate and reopen, and confirm scores, stats, notes/memories, Press state, and current hole resume correctly.
- [ ] Repeat with airplane mode enabled before launch; confirm the app shell and saved round open without a blank screen.
- [ ] Complete a fully scored round, confirm Finish once, relaunch, and verify one completed round and one frozen RoundRecord with unchanged settlement.
- [ ] Reopen that completed round, edit one score, finish again, and verify the prior frozen record remains in history and the new result becomes authoritative.
- [ ] Use “Play Another Round with This Group”; verify players/teams carry, while course/tees/games/scores/stats/Presses/summaries are fresh.
- [ ] With two devices, create/join a Shared Match, enter different assigned scores offline, reconnect, refresh, and verify no accepted score disappears and duplicate retries do not duplicate Presses or transactions.
- [ ] Force a temporary Shared endpoint failure; verify the local round remains usable and sync status is honest, then reconnect and confirm recovery.
- [ ] During active scoring, deploy or install a waiting worker; verify the update is announced but the app does not reload. Finish or leave the unsafe workflow, then refresh and verify v30.3.70 controls the page.
- [ ] Inspect More → App Updates diagnostics and confirm storage, active-round, Shared, preference, and frozen-record values match the current round.
- [ ] Confirm no routine interaction produces uncaught errors, blank states, raw stack traces, duplicate completion toasts, or duplicate historical rounds.

- [ ] In Match Setup, collapse and expand Players & Teams and Games with touch and keyboard; trigger a relevant checklist warning and confirm its section reopens without collapsing the other section.
- [ ] With Validate Greeny/Prox enabled, confirm an untouched default putt value awards nothing, then explicitly save 2 putts or fewer and confirm Greeny/Prox awards exactly once after reload and Shared sync.
- [ ] Use a large saved-player roster to search, replace, clear, and reselect players across several slots; confirm each selection lands in the intended slot and no duplicate assignment appears.

## Known limitations

- localStorage remains the on-device persistence mechanism; storage disabled by browser policy or exhausted device quota cannot be bypassed. The app now reports the failure and does not claim an unsafe save or Finish.
- Shared Match remains local-first and convergent rather than a real-time transactional database client. Conflicting same-player/same-hole edits remain explicit conflicts; the app does not silently choose a winner.
- Service-worker lifecycle behavior must still be physically verified on Safari/iOS because desktop and source-level tests cannot fully emulate installed-PWA suspension and controller transitions.
- No destructive storage migration was introduced. Older compatible records are normalized additively; irreparably malformed rows are ignored while usable rows remain available.
