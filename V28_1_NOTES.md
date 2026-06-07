# The Dye Ledger v28.1 Build Notes

## Match Summary Momentum Chart

- Restored the Momentum Chart to the unified Match Summary report for true two-team matches.
- Preserved the existing Momentum Chart calculations, appearance, and data source.
- Added support for team-stroke/team-format momentum eligibility where applicable.

## Match Header Player Details

- Added player detail cards to the Match Summary header.
- Each player card displays player name, Handicap Index, Tee, and Course Handicap when available.
- Missing legacy values are handled with graceful placeholders.

## Page Breaks and PDF Layout

- Updated Match Summary print/PDF layout rules so major sections, cards, and chart blocks avoid awkward page splits when practical.
- Removed the overly rigid behavior that forced every major section onto a new page.
- Preserved balanced spacing and natural content flow to avoid unnecessary blank pages.

## Scope

- No scoring logic changes.
- No settlement calculation changes.
- No Classic Scorecard changes.
- No localStorage format changes.
- No Supabase schema changes.
- No authentication or saved-match cloud sync changes.
