# The Dye Ledger v27.0 - Pass 1 Implementation Notes

## What changed
- Added Supabase browser client loading and a local `supabase-config.js` file.
- Added organizer-facing shared match creation toggle in Game Setup.
- Added shared match load / refresh controls in More.
- Added normalized cloud payload creation for:
  - matches
  - match_teams
  - match_players
  - match_memberships
- Added structural SQL for:
  - team_access_codes
  - score_entries
  - audit_log
  - match_notes
- Added hydration logic that rebuilds the current in-memory match shape from normalized Supabase rows.
- Added course/player snapshot hydration so a shared round can load even on a device that does not already have the same local players/courses saved.
- Added structural fields for `lastTouchedHole` and `lastFullyCompletedHole`.
- Preserved local-only use when Supabase is not configured.

## What this pass intentionally does not do yet
- Team code redemption/join flow
- Team-scoped score edit enforcement against Supabase
- Realtime score-entry sync
- Full audit logging behavior
- Finish/reopen cloud workflow changes
- Offline mutation queue / conflict reconciliation

## Next recommended pass
Pass 2 should implement:
1. Team code redemption / join flow
2. Team-scoped permissions
3. Shared score-entry writes to `score_entries`
4. First real cloud sync path during scoring
