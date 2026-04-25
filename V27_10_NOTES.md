# The Dye Ledger v27.10 — Putts Logic + Finish Existing Match Fix

## Scope
Targeted functional update from v27.9. No unrelated UI/layout changes were intended.

## Putts logic
- The live putts input now updates the active match model immediately through `commitSmartPuttsDomValue(...)`.
- Up & Down / Sandy checkbox changes now use the actual rendered stat checkbox handler and push the adjusted putts value into the active match model, not just the DOM input.
- Default putts remain 2 when unset.
- Checking Up & Down or Sandy auto-sets putts to 1 only while the source is default/auto.
- Manual putts edits mark the field as user-controlled and should not be overwritten by checkbox toggles.
- Putts changes continue to trigger the existing shared-match sync path.

## Finish flow
- Confirm Finish now updates the existing active match instead of clearing `activeMatchId`.
- Before finalization, the current hole DOM state is copied into the match model so the latest visible scores/stats are included.
- The existing match is marked `complete`, `completedAt` is set, progress fields are recalculated, and the same match id/reference is preserved.
- Shared matches schedule an immediate shared sync after finish.
- Completed matches remain visible as the active completed round and the finish controls are hidden/disabled afterward.

## Upload reminder
Preserve the existing `supabase-config.js` values when uploading this build.
