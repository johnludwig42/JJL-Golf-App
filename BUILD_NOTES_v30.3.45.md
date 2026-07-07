# BUILD_NOTES_v30.3.45.md

Build v30.3.45 - Shared Match Trust Release

## Release Theme
Shared Match trust: make connection, assignment, local save, sync, reload, and recovery states understandable during a real round.

## Files Changed
- app.js
- package.json
- package-lock.json
- manifest.json
- service-worker.js
- BUILD_NOTES_v30.3.45.md

## Summary of Shared Match Improvements
- Added a Shared Match trust card to the scoring screen for shared matches, including host/joined mode, connection state, sync state, last sync, assignment state, and local-save reassurance.
- Updated joined-device assignment language to clearly say when the device is waiting for host assignment and when it is assigned to score specific players.
- Preserved host authority to score all players and manage assignments.
- Hardened joined-device edit permission so assigned players must resolve to a real participant, and fresh cloud assignment metadata can block stale local assignment authority.
- Added lightweight shared sync diagnostics for last sync attempt, last successful pull, last successful push, local scored-hole count, and last friendly sync error.
- Added local persistence fields for shared sync status metadata in a backward-compatible, additive way.

## User-Facing Behavior Changes
- Joined devices now see: "Waiting for the host to assign players to this device." when unassigned.
- Assigned joined devices now see: "You are assigned to score: [player names]."
- Shared scoring now reassures users that scores are saved on this phone and can sync later.
- Offline or Supabase-unavailable states are shown as recoverable scoring states instead of mysterious failures.

## Validation Commands Run
- `node --check app.js` - passed.
- `node --check service-worker.js` - passed.
- `npm run lint` - failed because `eslint` is not installed/available in this working copy.
- `npm run validate` - failed because `scripts/validate-release.js` does not exist in this working copy.
- `npm test` - failed because `tests/*.test.js` does not exist in this working copy.
- `npm run test:money` - failed because `tests/money-math.test.js` does not exist in this working copy.
- `npm run test:run` - failed for the same reason as `npm test`; it aliases `npm run test`.
- `git diff --check` - passed; Git reported line-ending normalization warnings only.

## Manual Acceptance Checklist

### Host Flow
- Create Shared Match.
- Verify host status says Host device.
- Add players.
- Join second device.
- Assign player to joined device.
- Verify assignment display.
- Change assignment back to host.
- Refresh host.
- Refresh joined device.
- Confirm assignment persists.

### Joined Device Flow
- Join match with code.
- See waiting-for-assignment state.
- Receive assignment.
- Verify assigned player names.
- Score assigned player.
- Confirm local save message.
- Confirm sync state.
- Verify unassigned players cannot be scored.

### Sync Flow
- Host scores one player.
- Joined device scores assigned player.
- Refresh both.
- Compare live scores.
- Compare Match Summary.
- Verify Final Net Settlement uses current scores.

### Offline / Reconnect Flow
- Joined device enters score.
- Simulate connection interruption if possible.
- Confirm score remains saved locally.
- Reconnect.
- Confirm sync resumes or failure is clearly shown.

### Reload Flow
- Score several holes.
- Reload host.
- Reload joined device.
- Verify scores and assignments remain correct.

### Non-Shared Regression Flow
- Create normal local match.
- Score several holes.
- Save.
- Reload.
- Finish.
- Verify Match Summary and settlement.

## Known Limitations
- This release clarifies and hardens the existing Shared Match authority model; it does not add a new formal conflict-resolution engine.
- Manual two-device testing is still required for real Supabase, offline, PWA restart, and mobile Safari behavior.
- Existing encoded legacy copy remains in a few fallback strings that are not expected in normal Shared Match status paths.

## Future Follow-Up Items
- Build an executable Shared Match regression harness for assignment persistence, reload, score merge, and stale assignment cases.
- Design formal conflict-resolution rules if simultaneous edits become a supported workflow.
- Add deeper iPhone PWA acceptance coverage for lock/reopen/reconnect during active Shared Matches.
