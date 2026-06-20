# The Dye Ledger v30.3.4

## Shared Join-to-Assign Reliability & First-Hole Score Input Fix

Focused reliability release based on v30.3.3.

### Implemented
- Joined-device membership rows now include the shared device ID in the membership key so multiple devices cannot overwrite the same membership row.
- Joined devices publish their current device metadata to the shared match metadata immediately after joining.
- Host assignment flow now refreshes participant/device metadata before opening Player Assignments.
- Sync Now refreshes canonical participant metadata, assignments, and scores.
- Joined devices without assignments receive a clearer waiting state with Check Assignment.
- First-hole score inputs avoid focus-stealing scroll/viewport behavior so the numeric keyboard can remain open on first tap.

### Confirmed Scope
- No scoring calculation changes.
- No score synchronization model changes.
- No Supabase schema changes.
- No localStorage structure changes.
- No AI Round Story, Memories, Session, Course Library, or Saved Player behavior changes.
