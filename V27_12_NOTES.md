# The Dye Ledger v27.12 Notes

## Confirm Finish fix
- Corrected the Confirm Finish completion path to use the actual DOM-to-match scoring mutation function: `applyCurrentHoleDomToMatch(match)`.
- The prior build called `copyCurrentHoleDomToMatch(match)`, which was not defined and could stop completion immediately with a JavaScript error.
- Added defensive error handling around completion so failures are logged, a user-facing message appears, and the app does not remain stuck in an armed confirmation state.
- Confirm Finish now updates the existing active match in place, sets `status = 'complete'`, sets `completedAt`, recalculates progress fields, persists local state, and schedules an immediate shared Supabase sync for shared matches.
- The new-match finish-confirmation dialog now only proceeds to a blank setup after the finish action reports success.

## Game Setup Update Match placement
- Added a top-level `Update Match` button in the initial Game Setup control card next to `New Match` and `Edit Active Match`.
- The top `Update Match` button is shown while editing an active/saved match and submits the existing `matchForm`, so it uses the same update path as the lower Update Match button.
- Added helper text near the top controls: “After making changes, tap Update Match to save them.”
- The existing lower Update Match button remains in place for continuity.

## Scope
- No scoring calculations, stat tracking, print/export, or Supabase schema changes were intended in this pass.
