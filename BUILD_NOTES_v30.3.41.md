# BUILD_NOTES_v30.3.41.md

Build v30.3.41 - Smart Score Advance Timing & Sticky Nav Polish

## Summary
This release refines scoring flow and app chrome behavior while keeping the patch scoped to Smart Score Advance, score acknowledgement, sticky navigation, runtime diagnostics, and version/cache consistency.

## Changes
- Added Smart Score Advance timing presets:
  - Fast: 200 ms
  - Normal: 300 ms default
  - Relaxed: 500 ms
- Persisted the Smart Score Advance preset with matches, saved matches, next-round drafts, and match templates.
- Simplified Smart Score Advance so it only advances to the next playable hole when:
  - Smart Score Advance is on.
  - Stat Tracking is off.
  - All active, visible, editable score inputs for the current scoring context have gross scores.
- Reused the existing Next Hole save/navigation pathway for automatic next-hole movement.
- Tuned score acknowledgement feedback to a subtle 320 ms accent flash and scale animation with no layout shift.
- Improved sticky behavior for scoring navigation, report/export controls, and course-library summaries.
- Hardened normal scoring selectors to avoid query-selector diagnostics caused by unescaped player ids.
- Updated app version and cache references to v30.3.41.

## Verification Focus
- Confirm timing presets persist through create, edit, saved match reload, next-round draft, and match templates.
- Confirm Smart Score Advance ignores non-visible, disabled, or locked score rows.
- Confirm Stat Tracking disables automatic next-hole advancement.
- Confirm Recent App Errors stays empty during normal score entry, stepper use, save, next, previous, and tab switching.
- Confirm installed PWA refreshes to cache `the-dye-ledger-v30.3.41`.
