# The Dye Ledger v30.3.1

## Player Library & Shared Assignment Regression Fix

Focused regression-fix release after v30.3.

### Fixed
- Restored saved-player editing from the Library tab by keeping the full player editor wired to the moved Library player-management UI.
- Editing a saved player now opens the Library player form, preserves the existing player ID, and saves back to the existing saved-player record.
- Restored shared-match joined-device assignment targets by refreshing and merging Supabase membership device records when the Match tab/shared panel renders and when Sync Now is tapped.
- Host assignment UI once again shows joined devices as assignment targets when participant records are available.

### Unchanged
- No scoring, handicap, Nassau, settlement, stat calculation, Shared Match score-sync model, AI Round Story, Memories, session, Supabase schema, or localStorage schema changes.
