# The Dye Ledger

Current version: **v22.8**

## What changed in v22.8
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
