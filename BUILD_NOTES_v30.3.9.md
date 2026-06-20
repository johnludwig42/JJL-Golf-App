# The Dye Ledger
Version: v30.3.9
Release Date: 2026-06-20

## Release Theme
Fix the underlying shared assignment, iOS Play input, sticky navigation, and shared-memory sync defects.

## Changes
- Extended Shared Match fast refresh while the host remains in setup/assignment so joined devices do not fall back to the 30-second participant refresh cadence mid-setup.
- Added on-demand participant/device hydration when the host opens a player assignment dropdown.
- Added assignment self-healing: if a selected joined device is not yet in local state, the app refreshes assignment devices once before rejecting the assignment.
- Converted the final app chrome layout from fixed-shell/body-hidden scrolling to sticky chrome with normal document scroll for iOS Safari keyboard reliability.
- Removed vertical `window.scrollTo(...)` behavior from viewport stability guards so score inputs can use native iOS focus/keyboard behavior.
- Made full-match shared uploads non-destructive for shared metadata by re-reading live `course_snapshot.sharedMatchMeta` immediately before upsert and unioning memories/devices.
- Updated app version references, manifest query strings, service-worker cache name, About text, and footer display to v30.3.9.

## Functions / Blocks Changed
- `startSharedConnectionFastRefresh()` in `app.js`: re-extends the fast refresh window while setup/assignment is active.
- `setSharedPlayerAssignment()` in `app.js`: refreshes shared assignment devices before showing the unavailable-device toast.
- `refreshSharedAssignmentDevicesOnDemand()` in `app.js`: new small helper for dropdown-triggered device hydration.
- `installHandlers()` setup Shared Match admin listeners in `app.js`: added `focusin`, `pointerdown`, and `touchstart` assignment-dropdown refresh hooks.
- `uploadSharedMatch()` in `app.js`: performs adjacent pre-upsert shared metadata merge so local full uploads cannot erase memories written by other devices.
- `resetHorizontalViewportPosition()` and `installViewportStabilityGuards()` in `app.js`: horizontal-only clamp; no vertical scroll reset while score inputs are focused.
- Final `.app-chrome` / `main` app-shell block in `style.css`: replaces fixed app shell with sticky chrome and normal document scroll.

## Validation Checklist
- [ ] Joined device becomes selectable within a few seconds while host stays on Match/setup.
- [ ] Opening an assignment dropdown forces a fresh device pull.
- [ ] Assigning a just-joined device succeeds without manual Sync Now.
- [ ] First tap on a Gross score input opens the iOS keyboard.
- [ ] Score live updates, blur/Enter commit, and auto-advance still work.
- [ ] Header and six tabs remain visible while typing scores with the keyboard open.
- [ ] Joined-device memories appear on host and are not erased while host scores.
- [ ] Host memories still sync to joined devices.
- [ ] Local-only scoring, stat tracking, save/next-hole, and finish round still work.
- [ ] Shared scores, player assignments, Start Scoring, and Match Summary still work.
