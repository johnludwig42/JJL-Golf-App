# The Dye Ledger v30.3.11

Release Theme: Assign players to participants, not devices.

## Changes
- Introduced a participant-based Shared Match assignment layer with stable per-match participant IDs.
- Updated Shared Match assignment dropdowns to save participant IDs while displaying participant/cart names.
- Updated score/stat editability checks so joined devices own players by participant ID instead of fragile local device ID matching.
- Preserved legacy device ID assignments by resolving them to participant IDs where possible.
- Extended shared metadata to carry participants alongside legacy devices and playerAssignments.
- Updated Shared Assignment Diagnostics and simulation harness for the participant model.
- Updated app version to v30.3.11.

## Files Modified
- app.js
- index.html
- manifest.json
- service-worker.js
- README.md

## Validation Checklist
- [ ] Host creates Shared Match and stays on Match tab.
- [ ] Joined device receives stable participantId.
- [ ] Host sees joined participant by device/cart name.
- [ ] Assignment dropdown values are participant IDs.
- [ ] Joined participant can score/stat assigned players.
- [ ] Joined participant cannot edit unassigned players.
- [ ] Host can still edit all players.
- [ ] Existing device ID assignments resolve safely where possible.
- [ ] Local-only scoring remains unchanged.
- [ ] Shared score and memory sync still work.
