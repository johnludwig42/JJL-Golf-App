# The Dye Ledger v30.3.18 Build Notes

## Release Theme
Match Summary export and Scores tab polish.

## Changes
- Removed detailed missing-hole diagnostics from the printed/shared Match Summary while preserving the in-app missing-score diagnostic.
- Added a small provisional report label for incomplete shared/printed Match Summary exports without listing player/hole missing-score details.
- Polished the top Scores tab presentation above Match Status with cleaner card spacing, metadata separation, and mobile-friendly action wrapping.
- Hardened Scorecard Snapshot and Round Awards label/value presentation so values have visible spacing after each colon on screen and in print/export.
- Hardened user-facing timestamp formatting to use America/New_York conversion and an ET display label instead of merely relabeling UTC/browser-local time.
- Updated visible app version references to v30.3.18.

## Guardrails
- No scoring, game, settlement, handicap, Supabase, Course Library, Shared Match, or saved-match storage changes were introduced.
- Internal timestamp storage remains unchanged.
