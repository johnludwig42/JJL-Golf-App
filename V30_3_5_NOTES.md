# The Dye Ledger v30.3.5

## Shared Assignment Persistence Fix

v30.3.5 is a narrow regression-fix release focused on preserving host player assignments to joined devices.

### Fixed

- Assignment controls now persist the selected canonical joined-device ID immediately.
- Host assignment changes are written locally and published directly to shared match metadata.
- Joined-device assignment values no longer snap back to Host Device when a valid joined device is selected.
- Assignment rendering now preserves valid saved values and only defaults to Host Device when no assignment exists.
- Sync Now / refresh flows no longer overwrite valid assignment selections with stale host defaults.
- Added friendly assignment-save error handling for unavailable devices or failed cloud saves.

### Root Cause

Joined-device discovery was working, but assignment persistence still relied too heavily on local fallback/default rendering and deferred shared-match upload behavior. In some cases, assignment controls could display joined devices while the selected joined-device ID was not immediately treated as the authoritative `sharedPlayerAssignments[playerId]` value in shared metadata.

### Guardrails

No scoring calculations, settlement calculations, score sync model, AI Round Story, Memories, Session architecture, Supabase schema, or localStorage structure were changed.
