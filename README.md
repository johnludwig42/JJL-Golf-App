# The Dye Ledger

Current version: **v27.24**

## What changed in v27.24

- Refined the Create New Match workflow for unscored active matches so the app uses a single confirmation and then opens a clean setup draft.
- Captures pending score-entry DOM values before showing the new-match dialog so Edit Current Match preserves current-hole edits.
- Ensures Cancel in the new-match conflict dialog disarms any pending Finish Round confirmation state.
- Removed the nonfunctional backdrop-click handler from the new-match conflict dialog.
- Shows Setup-tab Finish Round controls for any non-complete active match, not only when the editor is open.
- Adds an explicit reopen prompt when loading a completed saved match, allowing users to choose view/share or reopen for editing.
- Adds reopened-round messaging in the scoring meta line and scoreboard state.
- Relabels Finish Round controls to Save Updates & Finish / Confirm Save Updates when editing a previously completed round.
- Confirms reopened rounds overwrite the existing saved match record on finish.
- Updates manifest and service-worker cache version to v27.24.
