# BUILD_NOTES_v30.3.43.md

Build v30.3.43 - Round Weather Context Foundation

## Summary
This release adds optional, lightweight weather context to newly created rounds and makes the captured summary available to AI Round Recaps.

## Changes
- Added non-blocking weather capture after a match is successfully created and saved.
- Used browser geolocation only at round start, never during setup preview.
- Added Open-Meteo current conditions lookup without frontend secrets or paid API keys.
- Stored rounded approximate coordinates, current conditions, and a short weather summary with the round.
- Added backward-compatible `roundContext` normalization for older saved matches.
- Included weather context in the AI Round Recap payload with instructions to reference it only when natural.
- Added a compact Round Readiness weather status and recap input transparency row.
- Preserved round weather context in shared-match metadata without adding Supabase schema changes.
- Kept Match Templates setup-only and free of weather snapshots.
- Updated app version and cache references to v30.3.43.

## Verification Focus
- Confirm creating a match immediately navigates to scoring while weather capture runs in the background.
- Confirm denied location permission does not block scoring or populate Recent App Errors.
- Confirm offline match creation skips weather cleanly and does not populate Recent App Errors.
- Confirm captured weather summary appears in Round Readiness and the AI recap input preview.
- Confirm AI Round Recap payload includes `roundContext.weather` when captured.
- Confirm older saved matches without `roundContext` still load normally.
- Confirm Match Templates do not store old weather snapshots.
- Confirm installed PWA refreshes to cache `the-dye-ledger-v30.3.43`.
