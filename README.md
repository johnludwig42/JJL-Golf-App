# The Dye Ledger

Current version: **v24.9**

## What changed in v24.9

- fixed the Scoreboard Team Stroke Play display so the selected stroke play event now shows actual team stroke totals and margin instead of match-play style hole status
- audited Team Stroke Play scoring so aggregate net stroke play resolves correctly as a summed team total across Scoreboard, Games Summary, and Net Payout
- changed the Team Stroke Play default scoring mode to Aggregate while preserving Best Team Ball as an available option
- fixed Game Setup handicap preview so it rehydrates and renders for all golfers when editing a saved match
- removed a stale player setup render reference that could interfere with the Game Setup player slot UI
- updated the app notes and synchronized the displayed app version, manifest version, and service-worker cache version to v24.9
