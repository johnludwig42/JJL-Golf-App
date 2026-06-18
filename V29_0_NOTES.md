# The Dye Ledger v29.0

Shared Match Scoring Foundation release.

## Included
- Added Scoring Mode support for:
  - One Device Scores for Everyone (default/current local behavior)
  - Assigned Players Score Entry (shared-match foundation)
- Added local-first shared scoring device registration using anonymous device IDs.
- Added short shared match codes for shared match sessions.
- Added in-round Shared Match panel with match code, copy action, Sync Now, Last Sync, and player assignment controls for the host device.
- Added player-based scoring permissions: all players remain visible, but only players assigned to the current device are editable in Assigned Players Score Entry.
- Preserved local-first behavior: local device remains the working copy and Supabase remains the synchronization layer.
- Stored shared scoring metadata in existing Supabase-compatible JSON snapshots to avoid disruptive schema expansion.
- Added Supabase schema notes for the new `assigned_players` scoring mode.
- Updated application version references to v29.0.

## Architecture summary
- Local device remains authoritative for immediate scoring entry and local saved-match compatibility.
- Supabase is used as an opportunistic sync layer for shared matches.
- Shared match sync occurs on save/load/manual sync and existing opportunistic sync hooks; keystroke-level collaboration is intentionally not implemented.
- Device/player assignment metadata is stored in the shared match snapshot and player handicap snapshots for future migration to dedicated identity tables.
- Future extensibility remains open for mobile-number player identity, cloud analytics, GHIN integration, player profiles, AI Trip Recaps, and event recaps.

## Not included
- No player authentication.
- No mobile-number login.
- No GHIN integration.
- No public match discovery.
- No anyone-can-score mode.
- No cloud match history UI.
