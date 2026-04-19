The Dye Ledger v27.8 — shared persistence and refresh recovery fix

What changed
- Added dirty tracking for shared-match sync so edits made while a cloud write is already in flight are not lost.
- If a score/stat change occurs during an in-flight shared sync, the match is marked dirty and a second flush runs immediately after the first finishes.
- Shared sync scheduling now remembers the last opened shared match reference so the app can restore it after refresh.
- Added startup resume logic that automatically reloads the last-opened shared match from Supabase when the app restarts, with a local shared fallback if cloud reload is unavailable.
- Shared match creation/load paths now persist the active shared match reference for refresh recovery.

Exact live mutation/write behavior
- The existing live score/stat/greenies mutation paths remain the source of truth.
- Shared writes still trigger from the real score/stat/greenies mutation paths already in the app.
- The reliability fix is that changes arriving during an existing cloud write now queue a guaranteed follow-up flush instead of being skipped.

Refresh recovery
- The app now stores the last-opened shared match ID/reference in local state.
- On startup, if no active shared match is already open, the app attempts to reopen that shared match automatically.

Version
- App version advanced to v27.8.
