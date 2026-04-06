# The Dye Ledger

Current version: **v24.7**

## What changed in v24.7

- fixed a Game Setup rendering regression that could prevent the player picker and per-player handicap tee selector from appearing after team/player-count changes
- preserved the single tap-to-select player card UI while leaving the handicap tee selector unchanged
- kept all other game setup, scoring, scoreboard, and print behavior unchanged


- removed the duplicate second player selector from Game Setup so the tap-to-select player card remains the primary player picker
- kept the per-player handicap tee selector unchanged
- improved iPhone stat tracking rendering so Fairway Hit reliably appears on scoring input for par 4 and par 5 holes
- updated the app notes and synchronized the displayed app version, manifest version, and service-worker cache version to v24.7
