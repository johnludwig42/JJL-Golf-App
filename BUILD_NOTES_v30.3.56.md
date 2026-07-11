# Build Notes v30.3.56 — SSP Shared Match Sync and Reconciliation

## Release Theme

Every device, one SSP truth.

## Shared Match Data Shape

Scores/stats remain in `score_entries`; assignments/devices remain in `course_snapshot.sharedMatchMeta`; setup remains in `matches.selected_games`. SSP adds a backward-compatible `sharedMatchMeta.sspFacts` envelope with normalized settings, per-hole facts, played-hole order, completion timestamps, update time, and source device. Calculated ledgers and settlements are not cloud truth.

## Behavior

- Syncs point value, Greeny/Prox validation, Bridge/Re-Bridge, Umbee, Umbee-with-Bridge, sequence mode, player flags, Prox, Bridge/Re-Bridge, notes, and sequence metadata.
- Player facts follow assigned-player scoring. The host edits all players; joined scorers edit assigned players. Hole facts are host-only.
- A last-synced baseline supports three-way reconciliation: independent fields merge; overlapping edits create `sharedSspConflicts` and retain the local value for host review.
- Shared status shows SSP synced, pending, or conflict. Match Summary pulls current scores and SSP metadata before deriving settlement.
- Non-SSP and older Shared Matches remain backward-compatible.
- Moved Bridge/Re-Bridge tee-box controls into the SSP header/control area beside stakes, validation, Umbee, and multiplier context.
- Strengthened the Sneaky / Sandy / Poley header hierarchy while keeping its live-preview subline compact.
- Removed the redundant top `SSP Points` pill and labeled the lower calculated area `Hole Points` with a live-preview cue.

## Tests

Added `tests/ssp-shared-match.test.js` and `npm run test:ssp-shared` for settings/facts, Prox, Bridge/Re-Bridge, notes, entry order, independent edits, conflicts, and non-SSP compatibility.

## Known Limitations

Conflict resolution is warning/manual-host review rather than a polished UI. Bridge/Re-Bridge timing, Poley length/first-putt, and Sandy bunker source remain scorer-confirmed. Randomized shared simulation, SSP Momentum Chart, printed/PDF optimization, and Junk Games Framework abstraction remain deferred.

## Manual QA

Create a Shared Match with SSP, join a second device, assign opposite teams, enter scores/player SSP facts on each device, and sync. Confirm setup, player facts, Prox, Bridge/Re-Bridge, notes, Quick Scoreboard/Play status, and settlement agree. Make competing edits to one field and confirm a warning with no silent overwrite. Generate Match Summary after a remote edit and confirm the final pull. Repeat a non-SSP Shared Match and a local-only SSP match.
