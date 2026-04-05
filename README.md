# The Dye Ledger

Current version: **v23.4**

## What changed in v23.4
- expanded match setup to allow up to 8 teams
- preserved support for up to 4 players per team
- raised the total player-slot cap from 12 to 32
- updated the in-app App notes to reflect the new team/player limits
- synchronized the displayed app version and manifest/service-worker cache version to v23.4

## Previous changes in v22.8
- packaged the full app again for the release zip
- updated the player search results so they show only the player name and index
- fixed the player search sheet crash by replacing the undefined `formatNumber(...)` call
- changed match setup fallbacks so `teamCount` and `playersPerTeam` default to `1` instead of `2`
- added live net-score updates during score entry when a gross score is typed
- added visual tee-selection error highlighting for any player slot missing a tee
- updated print/export so Match Summary forces scoreboard sections open before printing
- updated print/export so only the selected print view is shown when printing in landscape
- renamed app icon assets to `v2` filenames and updated all references
- removed duplicate legacy PNG icon files from the build

## Baseline
This build was produced from the stable v22.6 codebase and then updated with the targeted fixes and packaging cleanup above.
