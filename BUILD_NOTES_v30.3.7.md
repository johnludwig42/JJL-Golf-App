# The Dye Ledger
Version: v30.3.7
Release Date: 2026-06-19

## Release Theme
Fix the actual causes, not the symptoms.

## Changes
- Added a canonical shared-device hydration path for assignment readiness and assignment dropdown options.
- Stabilized Play tab score input initialization by wiring score inputs after all Play subcomponents render.
- Consolidated the app shell into a single-scroll-container model so the header and six tabs remain fixed while content scrolls.
- Connected memory creation to shared memory publishing so joined-device memories can sync back to the host.

## Files Modified
- app.js
- style.css
- index.html
- manifest.json
- service-worker.js
- README.md

## Validation Checklist
- [ ] Joined device is selectable immediately when shown as ready for assignment.
- [ ] Hole 1 score input accepts input immediately after match setup without tapping a stat first.
- [ ] Header and six tabs remain visible during Play tab scrolling and keyboard open/close.
- [ ] Joined-device memories publish to shared metadata and appear on the host.
- [ ] Existing saved matches load normally.
- [ ] Local-only scoring, shared scoring, games, Nassau, Greenies, settlements, and Match Summary remain unchanged.
