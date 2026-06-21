# The Dye Ledger v30.3.16 Build Notes

## Release Theme
Course identity should be accurate, and course sync should be measurable.

## Changes

### Course Duplicate Detection Fix
- Tightened Course Library duplicate matching so distinct courses at the same property are not blocked simply because one course name contains another.
- Added normalized course identity helpers that compare course names using case/punctuation/spacing normalization without prefix or substring matching.
- Preserved true duplicate protection for punctuation/case/spacing variants such as `Whistling Straits Irish`, `Whistling Straits - Irish`, and `Whistling Straits (Irish)`.
- Confirmed examples like `Whistling Straits` vs. `Whistling Straits Irish` and `Blackwolf Run` vs. `Blackwolf Run River` remain distinct.

### Course Sync Timing Diagnostics
- Added lightweight timing diagnostics for Publish Local Changes / Course Library sync.
- Course Sync Complete can now show View Timing Details with total sync time and major phases including local scan, cloud lookup, duplicate checks, course writes, tee sync, hole sync, and cloud refresh.
- Added optional per-course timing details to help identify whether tees, holes, duplicate checks, or cloud lookup are driving perceived sync time.

## Guardrails
- No Supabase schema changes.
- No cloud deletion, course merging, or auto-cleanup added.
- No scoring, games, settlements, Shared Match, Match Summary, memories, or AI scorecard import changes.
- Existing saved matches, courses, tees, localStorage data, and cloud Course Library compatibility preserved.

## Version
- Updated visible app version, manifest, service worker cache name, and asset query strings to v30.3.16.
