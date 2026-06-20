# The Dye Ledger
Version: v30.3.8
Release Date: 2026-06-20

## Release Theme
Shared Match setup should feel intentional, clear, and ready before scoring begins.

## Changes
- Shared Match hosts now remain on the Match tab after creating a shared match so devices can join and player assignments can be completed before scoring begins.
- Added joined-device naming to the Join Match workflow, with the last-used device name saved locally under `dyeLedgerSharedDeviceName`.
- Shared participant lists and player assignment dropdowns now display human-readable device names while preserving stable technical device IDs for saved assignments.
- Updated Shared Match readiness language so “Ready for assignment” appears only when a joined device is actually available as an assignment option.
- Added a host-visible Start Scoring action in the Shared Match setup panel.

## Files Modified
- app.js
- index.html
- manifest.json
- service-worker.js
- README.md

## Validation Checklist
- [ ] Host creates a Shared Match and remains on the Match tab.
- [ ] Match code, participants, player assignments, and Start Scoring are visible before scoring begins.
- [ ] Joined device can enter a device name and match code.
- [ ] Joined-device name appears on the host participant list.
- [ ] Assignment dropdown shows human-readable device names but saves technical device IDs.
- [ ] “Ready for assignment” appears only when the joined device is selectable.
- [ ] Start Scoring opens the Play tab without changing scoring behavior.
- [ ] Local-only match setup still follows the prior flow.
- [ ] Existing saved matches still load.
