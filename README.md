# The Dye Ledger

Current version: **v24.2**

## What changed in v24.2

- fixed Game Setup so the player assignment area immediately renders the correct number of player slots after changing team count or players per team
- preserved valid existing slot selections where possible when the team/player structure changes, while removing extra stale slots
- kept player tee selection and the existing player-selection flow intact while making the slot refresh logic more reliable
- refreshed the in-app App notes and synchronized the displayed app version, manifest version, and service-worker cache version to v24.2