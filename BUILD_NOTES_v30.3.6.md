# The Dye Ledger
Version: v30.3.6
Release Date: 2026-06-19

## Release Theme
Ready should mean ready.

## Changes
- Fixed Shared Match metadata merging so participant readiness, assignment options, assignments, and memories use a consistent shared metadata path.
- Added additive, ID-based Shared Memories synchronization through shared match metadata so joined-device memories can appear on the host without duplicate or stale overwrites.
- Added Play input state initialization when the Play tab opens and when the score grid renders, ensuring Hole 1 score inputs are enabled and wired immediately after match setup.
- Hardened the app shell so the header and six top tabs remain fixed while Play tab content scrolls underneath.
- Updated app version references, cache name, manifest version, About notes, and footer display to v30.3.6.

## Files Modified
- app.js
- style.css
- index.html
- manifest.json
- service-worker.js

## Validation Checklist
- [ ] Joined device appears ready only when actually assignable.
- [ ] Assignment selector shows Joined Device immediately.
- [ ] Host can assign player to Joined Device without delay.
- [ ] Assignment persists and reaches the joined device.
- [ ] New match can immediately enter Hole 1 score without tapping stats first.
- [ ] Keyboard opens on score input tap.
- [ ] Header and six tabs remain visible on the Play tab during deep scrolling.
- [ ] Keyboard open/close does not permanently break header/tab position.
- [ ] Joined device can add a memory.
- [ ] Joined-device memory appears on the host after sync.
- [ ] Host and joined-device memories coexist without duplicates.
- [ ] Existing saved matches load.
- [ ] Local-only scoring, Shared Match creation/joining, games, Nassau, Greenies, Final Settlement, Match Summary, Library player management, and Course Library sync remain unchanged.
