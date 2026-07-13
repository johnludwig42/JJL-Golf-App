# v30.3.68 – Player Preferences Foundation

## Release theme

The app remembers your rhythm.

## Product and architecture

This release adds one schema-v1, local-first Player Preferences object at `dyeLedger.playerPreferences`. It distinguishes persistent global defaults, independently saved match settings, and device-local view preferences. Normalization is deterministic, does not mutate source data, completes invalid or partial known fields, and preserves unknown top-level and nested fields. Storage failures fall back safely and ordinary preference changes report success only after a successful write.

The six preferences and defaults are:

- Smart Score Advance: Normal (Fast 500 ms, Normal 750 ms, Relaxed 1000 ms).
- Haptic confirmation: On, subject to device support.
- Stat Tracking default: Off.
- Classic Scorecard initial state: Collapsed.
- Score Distribution initial state: Collapsed.
- Momentum Charts initial state: Collapsed.

Player Preferences appears as a compact, mobile-first card under More. Native radio controls provide keyboard operation and selection semantics, helper text explains scope, and immediate saves use the existing nonblocking live-region toast. Reset to Defaults requires an accessible confirmation, restores all six known defaults, preserves unknown future fields and unrelated storage, and never clears saved matches, courses, or players.

## Match, runtime, and view behavior

Standard new matches and host-created Shared Matches seed Smart Score Advance and Stat Tracking from Player Preferences. Match Setup remains editable, and submitted overrides are saved only to that match. In-process editing reads and updates the saved match values without rereading or rewriting global preferences. Existing active matches retain their stored values; existing compatibility normalization remains unchanged. Completed matches and frozen RoundRecords are not modified.

Explicit source/duplicate values win, followed by explicit template fields, current Match Setup selection, Player Preferences, and application defaults. Legacy templates missing a supported field receive the preference only for that missing field. The existing Start Another Round flow preserves source match values. No separate duplicate-round command exists in this version.

Smart Score Advance runtime continues to use the match-specific preset and existing Stat Tracking gate. Haptics remain a device-local runtime preference rather than match data; enabled devices request one existing-path vibration when supported, while unsupported devices safely do nothing. Score saving and visual confirmation are unchanged.

Quick Scoreboard reads preferences when it opens. Classic Scorecard, Score Distribution, and Momentum Charts receive their saved initial disclosure states. Manual toggles remain temporary for that open view and never update global preferences, RoundRecord, or Shared Match metadata. Desktop and mobile share the same path.

The current JSON backup intentionally exports broad match/player/course state and excludes separate UI preference keys, so backup/import behavior remains unchanged. Lightweight diagnostics include only preference schema version, storage availability, and stored-versus-default source.

## Files changed

- `app.js`
- `index.html`
- `style.css`
- `package.json`
- `package-lock.json`
- `manifest.json`
- `service-worker.js`
- `tests/player-preferences.test.js`
- `tests/mobile-scoring-ux.test.js`
- `docs/PLAYER_PREFERENCES_ARCHITECTURE.md`
- `BUILD_NOTES_v30.3.68.md`

## Tests added or expanded

- Exact defaults; missing, empty, partial, valid, invalid, malformed, deterministic, immutable, and unknown-field normalization.
- Default creation, save/reload, nested updates, storage failure, corruption fallback, safe reset, unrelated-storage preservation, and unknown-field reset semantics.
- New-match derivation and explicit source/template/setup precedence without global write-back.
- FAST/NORMAL/RELAXED timing and enabled/disabled/unsupported haptic gates.
- Expanded and collapsed Quick Scoreboard disclosures without match mutation.
- More-tab labels, six-control scope, helper copy, save feedback, reset confirmation, storage key, and RoundRecord exclusion source guards.
- Existing mobile Quick Scoreboard and release-version assertions updated for v30.3.68.

## Validation results

- `node --check app.js`: passed.
- `node --check service-worker.js`: passed.
- Focused Player Preferences suite: 7/7 passed; combined Player Preferences and mobile suite: 18/18 passed.
- `npm test`: 127/127 passed.
- `npm run test:run`: 127/127 passed.
- `npm run simulate`: 60 rounds, zero failures, 60 exact live/mirror matches, zero differences.
- `npm run simulate:live`: 60 rounds, zero failures, 60 exact live/mirror matches, zero differences.
- `npm run simulate:compare`: 60 rounds, zero failures, 60 exact live/mirror matches, zero differences.
- `npm run simulate:100`: 110 total rounds, zero failures, 110 exact live/mirror matches, zero differences.
- Simulations retained the established warning counts and one suspicious-outcome flag; no new mismatch or failure occurred. The generated tracked report was restored after validation.
- `npm run release:sanity -- v30.3.68`: 8 PASS, one expected dirty-working-tree warning, zero FAIL.
- `git diff --check`: passed; only existing line-ending conversion warnings were reported.
- `npm run lint`: attempted but unavailable because the local `eslint` executable is not installed. Dependencies were not installed or changed.
- Rendered browser QA passed at desktop size and a 320 px mobile viewport: six accessible controls, immediate feedback, reload persistence, reset confirmation, default restoration, no horizontal overflow, 44 px segmented targets, and Relaxed / Stat Tracking On inheritance into a new Match Setup.

## Manual QA checklist

- Open More → Player Preferences; change each preference, reload, and confirm persistence.
- Reset to Defaults; confirm all six defaults return and saved matches/courses/players remain unchanged.
- Set Relaxed and Stat Tracking On; open a new match and confirm setup defaults. Change that match to Fast and Off, save it, then confirm the next new match again starts Relaxed and On.
- Edit an active match; confirm its values persist and the global preference does not change.
- Set mixed Quick Scoreboard defaults, open it, verify initial states, manually toggle them, and confirm reopening uses saved defaults without changing preferences.
- On a supported device, commit with haptics On and Off; confirm scoring and visual confirmation work in both cases. Confirm desktop/unsupported devices do not error.
- Create a Shared Match as host and join from another device; confirm host match settings remain authoritative and each device retains personal view/haptic preferences.
- Open a completed round and confirm its RoundRecord and historical values are unchanged.

## Known limitations and deferred items

Quick Scoreboard Classic Scorecard horizontal scrolling remains unresolved. Shared Match Press capability still requires a later focused end-to-end iteration. Cloud sync, accounts, device-to-device preference sync, custom timing, course/tee/player/game/wager defaults, themes, accessibility suites, notifications, Watch settings, voice entry, analytics, and behavioral learning remain deferred.

No scoring, handicap, Postable Score, Nassau, Match Play, Press, Skins, Net Skins, SSP, Greenies, settlement, Shared Match authority, or RoundRecord math was changed. No dependencies were added. Codex did not commit, push, merge, or create a pull request.
