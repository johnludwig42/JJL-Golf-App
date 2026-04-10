# The Dye Ledger

Current version: **v26.2**

## What changed in v26.2

- optimized the default iPhone Safari / installed PWA experience so the app fits and reads more naturally at 100% zoom
- increased mobile input sizing to reduce iPhone zoom friction and improved safe-area spacing
- adapted top navigation, setup rows, action groups, score entry controls, and bottom sheets for small portrait screens
- preserved desktop layouts while making wide content deliberately scrollable or stacked on mobile

- fixed the Scoreboard Team Stroke Play display so the selected stroke play event now shows actual team stroke totals and margin instead of match-play style hole status
- audited Team Stroke Play scoring so aggregate net stroke play resolves correctly as a summed team total across Scoreboard, Games Summary, and Net Payout
- changed the Team Stroke Play default scoring mode to Aggregate while preserving Best Team Ball as an available option
- fixed Game Setup handicap preview so it rehydrates and renders for all golfers when editing a saved match
- removed a stale player setup render reference that could interfere with the Game Setup player slot UI
- updated the app notes and synchronized the displayed app version, manifest version, and service-worker cache version to v26.2


## v25.1
- Added Finish Round controls to the Scoreboard tab using the same shared completion workflow as the Scoring tab.
- Hides Scoreboard finish controls from print/PDF output.


Latest update: v26.2 adds a persistent in-app version label and a safe service-worker update banner with an explicit Update action.

- Share / Save PDF UX now uses a clearer iPhone-first Share Match flow with a simplified export selector.
