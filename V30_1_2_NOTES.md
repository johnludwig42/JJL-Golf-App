# The Dye Ledger v30.1.2 – Header & Navigation Density Optimization

## Release Theme

More golf. Less chrome.

## Summary

v30.1.2 is a focused UX polish build that reclaims vertical space by tightening the top navigation tabs and improving header alignment. The lifecycle tab structure remains unchanged: Match, Play, Scores, Library, Insights, More.

## Changes

- Reduced top navigation vertical padding and icon/label spacing.
- Preserved icon-above-label tab presentation.
- Preserved comfortable tap targets above the practical 44px minimum.
- Vertically centered the app icon/title header presentation.
- Reduced redundant header/tab spacing slightly.
- Updated app version, manifest, and service worker cache to v30.1.2.

## Estimated Space Reclaimed

Approximately 10–14 vertical pixels on common iPhone portrait layouts, depending on device width and safe-area behavior.

## Guardrails

- No scoring changes.
- No handicap changes.
- No Nassau changes.
- No Match Summary or settlement changes.
- No shared-match sync changes.
- No Library workflow changes.
- No Insights changes.
- No memory workflow changes.
- No localStorage schema changes.
- No Supabase schema changes.

## Verification Notes

- `app.js` passes JavaScript syntax check.
- Tab buttons retain a minimum height greater than 44px.
- Icons remain above labels.
- Header icon and title are aligned as a single visual unit.
