# The Dye Ledger v27.7 Notes

This pass only addresses shared-match Supabase write reliability.

## What changed
- Reduced the default shared sync debounce from 700ms to 200ms.
- Live score input changes now trigger shared sync immediately from the real on-screen score inputs.
- Live stat and greenies changes now trigger shared sync immediately from the real on-screen inputs.
- Blur on score/stat inputs now forces an immediate shared sync.
- Hole saves / next-hole transitions now flush shared sync immediately.
- Added hidden/pagehide flush hooks so pending shared changes are pushed when the tab is backgrounded or left.

## Intended result
When entering or editing scores/stats in a shared match, Browser B should now see the newly entered values much more reliably when loading the same shared match ID.

## Important
Preserve the existing `supabase-config.js` values when uploading this build.
