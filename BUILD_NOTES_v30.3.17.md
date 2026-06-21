# The Dye Ledger v30.3.17 Build Notes

## Release Theme
Recap polish and missing-score accuracy fix.

## Updates
- Fixed missing-score diagnostics so valid gross scores are recognized using the same effective score source as reporting.
- Changed the missing-score panel to start collapsed with a clear Round Complete / Round Incomplete header.
- Polished hole-by-hole player stats by matching FW header styling and centering hole numbers.
- Improved Scorecard Snapshot and Round Awards readability with Label: Value formatting.
- Added a responsive desktop side-by-side layout for Scorecard Snapshot and Round Awards, while keeping mobile stacked.
- Converted user-facing recap and memory timestamps to Eastern Time / ET display without changing stored timestamp data.

## Guardrails
- No scoring, game rule, settlement, handicap, Supabase schema, Course Library, Shared Match, or saved-match compatibility changes were introduced.
- Internal timestamp storage remains unchanged.
