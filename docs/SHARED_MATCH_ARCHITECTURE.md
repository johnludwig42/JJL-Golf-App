# Shared Match Architecture

Status: v30.3.72 — Confidence Across Devices

## Authority model

The host owns participants, player assignments, teams, games, course/round structure, Press records, finish state, and the frozen RoundRecord. In Assigned Players mode, the participant currently assigned to a player owns that player's scoring writes. A joined device cannot replace host assignment state, Press state, settlement, or the frozen record.

Each player assignment carries a host-authored revision, timestamp, participant ID, and updater ID. Joined devices accept a newer host revision and ignore an older replay. The host rejects assignment changes arriving from joined state. Assignments for players no longer in the round are removed during reconciliation, preventing orphaned rows after team or player-count changes.

## Score conflict resolution

Each locally changed player/hole records its participant, device, and update time. A received score is accepted when it comes from the currently assigned participant and is newer than the retained valid write. Identical replays are ignored. Older writes are ignored. Writes identifying a participant other than the current owner are rejected. Legacy rows without source metadata remain compatible: they can fill missing host state, while a newer timestamped local write is retained.

The deterministic score-entry ID remains match/player/hole based, so an accepted update replaces one row instead of creating a second score. Existing payout, Press, SSP, and settlement calculations continue to derive from the converged score state.

## Offline and reconnect behavior

Score changes are persisted locally before Shared Match upload. Going offline records that locally saved scoring is retained. The trust indicator reports `Saved Locally` when changes await synchronization and `Offline` when the device has no connection. The browser `online` event automatically schedules an immediate upload/pull cycle; returning focus also retries a pending or failed synchronization. `Retry Sync` remains available when useful.

## Trust indicator

Normal golfer-facing states are limited to:

- Green — `Synced`, only after score parity is confirmed.
- Blue — `Syncing`.
- Yellow — `Saved Locally`.
- Gray — `Offline`.
- Red — `Needs Attention`.

Expanded Shared Match details show Role, Connection, Last Push, Last Pull, Assigned Players, Scored Holes, Score Parity, App Version, and Device ID. Recovery actions are `Retry Sync`, `Refresh Assignments`, and `Copy Match Code`. Normal UI avoids protocol terminology.

## SSP and Press synchronization

SSP synchronizes its established fact envelope, not a calculated ledger. Three-way comparison remains authoritative; unchanged replay is diagnostic-only and every accepted fact affects the derived SSP ledger once. Press metadata remains host-authored. Stable Press IDs, lifecycle precedence, and deterministic merge collapse repeated delivery, so settlement and frozen Press Activity include each Press once.

## Finish workflow

The host performs final score/SSP reconciliation and authors the completed match and frozen RoundRecord. Joined devices pull that completed state and leave scoring. Stable match identity, immutable frozen transactions, and the host-only snapshot prevent duplicate completed rounds, settlements, transactions, or historical records.

## Technical diagnostics

Technical diagnostics retain up to 200 recent reason-coded events:

- `ASSIGNMENT_REJECTED`
- `ASSIGNMENT_REPLACED`
- `OFFLINE_SCORE_RETAINED`
- `STALE_SCORE_IGNORED`
- `DUPLICATE_SCORE_IGNORED`
- `DUPLICATE_PRESS_IGNORED`
- `DUPLICATE_SSP_IGNORED`
- `RECONNECT`
- `AUTHORITATIVE_OVERWRITE`
- `JOINED_OVERWRITE_PREVENTED`

These codes appear only in technical diagnostics, never in the golfer-facing trust indicator.

## Manual QA

1. Host creates a Shared Match and a second device joins.
2. Assign and reassign players; confirm both devices converge without reverting ownership.
3. Disconnect the joined device, score assigned players, refresh/restart, and reconnect.
4. Confirm automatic retry, identical scores, and `Synced` only after parity confirmation.
5. Replay refresh and assignment actions; confirm no duplicate scores or assignments.
6. Create one Press, enter SSP facts, disconnect/reconnect, and confirm each appears once.
7. Finish on the host and confirm both devices show the same winner, settlement, ledger, frozen RoundRecord, and historical report.

Physical multi-device network transitions and installed-PWA suspend/resume remain final device QA; deterministic automated coverage exercises the same state and replay contracts.
