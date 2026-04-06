# The Dye Ledger

Current version: **v24.5**

## What changed in v24.5

- fixed a Game Setup selector regression that could break the Course select and Player select flows
- removed a recursive setup-state update path so course changes and player assignments render and persist correctly again
- kept the recent team/player slot rendering behavior intact while restoring selector reliability
- refreshed the in-app App notes and synchronized the displayed app version, manifest version, and service-worker cache version to v24.4

- improved iPhone per-player tee selection so each player tee picker updates reliably, persists correctly, and refreshes handicap-driven calculations without resetting the setup UI
- added mobile-safe tee selection event handling by listening for both change and input events on setup tee selectors
- updated the app notes and synchronized the displayed app version, manifest version, and service-worker cache version to v24.5
