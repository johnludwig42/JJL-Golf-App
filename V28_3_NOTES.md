# The Dye Ledger v28.3 Build Notes

Focused Match Summary / 9-Point scorecard UX enhancement release.

## Included

- Gross Game Detail now starts on a fresh page in the generated Match Summary report.
- Added a dedicated 9-Point Scorecard to the Match Summary report immediately after the Classic Scorecard when 9-Point is selected.
- Improved the iPhone 9-Point Scorecard horizontal scrolling behavior so player names remain fixed and scrolling begins with Hole 1.

## Preserved

- Existing scoring calculations and settlement math.
- Existing 9-Point calculations.
- Existing Momentum Chart functionality.
- Existing Classic Scorecard calculations and visual behavior.
- Supabase Course Library functionality.
- AI scorecard import and multi-image import.
- Offline-first / local-first behavior.
- Existing localStorage and saved match compatibility.

## Not included

- No authentication changes.
- No saved-match cloud sync.
- No cloud course deletion.
- No Supabase schema changes.
- No unrelated refactoring.
