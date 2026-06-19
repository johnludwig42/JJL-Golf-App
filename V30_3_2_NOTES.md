# The Dye Ledger v30.3.2 – Shared Assignment Join Reliability Fix

## Release Theme
If a device joins, the host can assign it.

## What Changed
- Added explicit current-device membership registration when loading or syncing a shared match.
- Corrected joined-device membership role handling so joined devices are not written as organizer devices.
- Strengthened participant refresh before and during Shared Match assignment management.
- Added a joined-device waiting state when no players have been assigned yet.
- Added a Check Assignment action for joined devices to refresh assignments without reopening the app.
- Sync Now now updates the current device membership before refreshing participants and assignments.

## Root Cause
The join-to-assignment chain could rely too heavily on whole shared-match sync timing. A joined device could load the match locally without reliably persisting a distinct joined-device membership quickly enough for the host assignment UI to render it as an assignment target. In addition, membership role metadata could be written as organizer from joined devices during general sync.

## Preserved
No scoring calculations, handicap logic, Nassau logic, settlement logic, shared score sync model, AI Round Story, Memories, session behavior, Supabase schema, or localStorage structure were changed.
