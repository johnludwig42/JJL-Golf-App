# The Dye Ledger

Current version: **v23.9**

## What changed in v23.9

- reordered the Scoreboard to: Share / Print, Match Status, Hole-by-hole Momentum, Games Summary, Net Payout, Team Leaderboard, Player Leaderboard, Classic Scorecard, Stat Tracking, and Notes
- moved Notes from the More tab to the bottom of the Scoreboard while preserving note editing/saving behavior
- refreshed the in-app App notes and synchronized the displayed app version, manifest version, and service-worker cache version to v23.9

## What changed in v23.8
- added **Scoring control** to Game Setup with two explicit event modes: **Official Scorer** or **Team Input**
- added local role scaffolding for **Event Admin**, **Official Scorer**, **Team Scorer**, and **Viewer** so the app can mirror the permission model planned for Supabase
- added per-team scorer placeholders and access codes in Team Input mode so each team can be mapped later to a restricted Supabase role
- added a **Scoring access** card on the Scoring tab to preview and test which role is currently entering scores
- restricted Team Scorer editing so only that team’s players are editable in score entry, while Viewer remains read-only
- kept Event Admin and Official Scorer able to edit all teams
- added optional per-hole stat tracking (fairways, GIR, putts, up & downs, sandies) with a Scoreboard summary
- refreshed the in-app App notes and synchronized the displayed app version, manifest version, and service-worker cache version to v23.8

## What changed in v23.5
- fixed match setup tee selection so the visible reference-tee control and all player tee dropdowns stay synchronized on desktop and mobile, including 8-team / 32-slot setups
- when the match course changes, all player tee assignments now reset cleanly to a valid tee on that course instead of keeping stale tee ids
- when the default match tee changes, any empty or invalid player tee assignments now refresh to a valid tee automatically
- updated the Share / Print controls so the selected export view stays synchronized with the current print/save choice and button state
- refreshed the in-app App notes and synchronized the displayed app version, manifest version, and service-worker cache version to v23.5

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
