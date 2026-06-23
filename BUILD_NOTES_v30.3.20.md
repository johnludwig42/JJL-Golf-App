# The Dye Ledger v30.3.20

## Release Theme
PWA update controls and diagnostics.

## Changes
- Added a More tab App Updates card with current version, Build Date, cache, update status, and last update check.
- Added Check for Updates, Refresh Now, and Reset App Cache controls.
- Improved service-worker diagnostics to distinguish supported, page control, worker state, cache match, and update availability.
- Updated app version, cache names, manifest references, and footer build display to v30.3.20.
- Clarified build timestamp labeling as Build Date and tied it to build metadata rather than saved match or report timestamps.
- Added safeguards so Reset App Cache clears downloaded app shell/cache assets without clearing localStorage user data.

## Notes
- No Supabase schema changes.
- No scoring, game, settlement, handicap, Shared Match, Course Library, or saved-match data model changes.
