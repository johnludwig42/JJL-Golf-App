# Player Preferences Architecture

## Purpose and boundaries

v30.3.68 added one versioned, local-first preference store; v30.3.69 extends it with Press defaults and one Round Default for Shared Match. A **global preference** is a persistent default for future matches, a **match setting** is saved with one match and remains independently editable, and a **view preference** affects only the local presentation. These layers are intentionally separate.

No account, authentication, Supabase table, cloud sync, analytics, or new dependency is involved. Preferences work offline and do not change scoring, handicap, game, Press, or settlement logic.

## Schema and storage

The stable storage key is `dyeLedger.playerPreferences`. The current normalized schema is:

```json
{
  "schemaVersion": 2,
  "scoring": {
    "smartScoreAdvancePreset": "NORMAL",
    "hapticsEnabled": true,
    "statTrackingDefault": false
  },
  "press": {
    "pressesEnabled": false,
    "pressType": "MANUAL",
    "autoPressThreshold": 2,
    "declaringSideRule": "LOSING_SIDE_ONLY",
    "pressAvailabilityRule": "OPEN_SEGMENT_ONLY",
    "declarationWindow": "BEFORE_HOLE_STARTED",
    "maxPressesPerRound": 3,
    "maxRePresses": 0
  },
  "roundDefaults": {
    "sharedMatchEnabled": false
  },
  "quickScoreboard": {
    "classicScorecardExpanded": false,
    "scoreDistributionExpanded": false,
    "momentumExpanded": false
  }
}
```

`normalizePlayerPreferences()` is the sole normalization path. It accepts missing, partial, invalid, or malformed known data, returns a complete schema-v2 object, does not mutate its input, and preserves unknown top-level and nested fields. `roundDefaults.sharedMatchEnabled` accepts booleans only and otherwise normalizes to `false`. Storage parsing and writes are guarded; malformed JSON or unavailable storage falls back safely without preventing use of the app. Schema version remains 2 because this is an additive normalized field within the established v30.3.69 schema; no destructive migration is required.

The shared interface is `getPlayerPreferences()`, `savePlayerPreferences()`, `updatePlayerPreference()`, `resetPlayerPreferences()`, `normalizePlayerPreferences()`, and `getDefaultPlayerPreferences()`. Preference UI handlers do not access `localStorage` directly.

## Match inheritance and precedence

`getNewMatchDefaultsFromPreferences()` returns match-relevant defaults: Smart Score Advance, Stat Tracking, all supported Press defaults, and Shared Match enablement. Standard new-round setup uses those defaults. Haptics are not copied because haptics remain personal device behavior.

Creation precedence is:

1. Explicit duplicated/source match value.
2. Explicit template value.
3. Explicit selection in the current Match Setup.
4. Player Preference default.
5. Application default.

Templates retain explicit Smart Score Advance, Stat Tracking, and Shared Match fields; a legacy template missing a field receives only that missing preference default. The existing “Start Another Round” source flow preserves the prior match's explicit Shared Match, Smart Score Advance, and Stat Tracking settings, which follows source-value precedence. An explicit current-setup toggle wins for that round and never writes back to Player Preferences.

For an existing or in-process match, the saved match value wins, followed by existing compatibility normalization and then the application default. Global preferences are never continuously injected into an active match. Editing Match Setup updates only the match. Completed records and frozen snapshots are not rewritten.

Press Preferences expose Presses, Trigger, Prompt When Down, Who May Declare, Parent Availability, Declaration Timing, Maximum Presses, and Maximum Re-Presses. Press Stake is intentionally not a preference or Round Setup choice. Every newly created Press and Re-Press uses the original game or Nassau-segment wager. Legacy stake-policy fields remain normalization-compatible for existing active data and frozen history, but they are not user-editable and do not control new Press wager creation.

## Runtime and view behavior

Smart Score Advance continues to use the match-specific preset: FAST is 500 ms, NORMAL is 750 ms, and RELAXED is 1000 ms. Existing Stat Tracking interaction is unchanged: Stat Tracking prevents automatic next-hole advance. Changing either value in Match Setup does not update Player Preferences.

Haptic confirmation is device-local. When enabled, the existing score-commit confirmation pathway requests one short vibration only when `navigator.vibrate` is available. Disabled or unsupported devices perform no vibration and do not throw. Score persistence and visual confirmation remain independent of haptic support.

Quick Scoreboard reads the saved view preferences only when building a newly opened view. Classic Scorecard, Score Distribution, and Momentum Charts then begin expanded or collapsed accordingly. A manual disclosure toggle remains temporary DOM state and does not write a preference. Both desktop and mobile use the same renderer. These fields never enter match data, RoundRecord, or Shared Match metadata.

View precedence is the current temporary toggle in an already open view, then the saved preference on the next open, then the collapsed application default.

## Reset, backup, diagnostics, and compatibility

Reset requires confirmation and replaces known scoring, Press, Round Defaults, and Quick Scoreboard fields with current defaults while preserving unknown future preference fields and unrelated storage. Shared Match default resets to Off. It does not clear or modify matches, courses, players, or RoundRecords.

The existing JSON backup exports the broad match/player/course state object, not separate UI-setting keys. v30.3.68 preserves that established behavior, so Player Preferences are not added to export/import. Diagnostics expose only schema version, storage availability, and whether stored values or defaults are active; they do not log a preference history or player/match data.

Shared Match transports no preference object. Host preferences may seed a newly created authoritative match; joined-device preferences cannot change match rules. Quick Scoreboard and haptic preferences remain local to each device. RoundRecords exclude the global object, Quick Scoreboard defaults, and personal haptic state.

## Known limitations and future extensions

- Quick Scoreboard Classic Scorecard horizontal scrolling remains unresolved.
- Shared Match Press capability still needs a later focused end-to-end iteration.
- Preferences are intentionally device-local with no account or device-to-device sync.
- Custom timing, themes, accessibility suites, course/tee/player/game/wager defaults, favorite games, notifications, Watch settings, and behavioral learning are deferred.
- Future schema fields can be preserved by normalization but require explicit product and migration rules before becoming controls.
