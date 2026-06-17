# The Dye Ledger v28.20 Build Notes

Focused Scoring Workflow / Stat Tracking Matrix UX release.

## Changes

- Preserved the existing score-entry workflow.
- Replaced the vertically stacked Stat Tracking entry cards with a compact per-hole matrix below score entry.
- Added one row per stat-tracked player with columns ordered as FW → GIR → Putts → U&D → Sandy → Pen.
- Added checkbox/toggle-style controls for FW, GIR, U&D, and Sandy.
- Added compact +/- steppers for Putts and Penalty Strokes.
- Kept fairway tracking hidden on par 3s, consistent with prior behavior.
- Preserved player-specific stat tracking participation.
- Added mobile-first styling with a sticky Player column and horizontally scrollable stat columns only when needed.
- Updated application version references to v28.20.

## Preserved

- Score entry, Save Hole behavior, and hole navigation.
- Scoring, handicap, settlement, Nassau, Skins, Greenies, and 9-Point calculations.
- Match Summary, Round Recap, AI Recap, AI Scorecard Import, and Supabase Course Library behavior.
- Existing saved match and localStorage compatibility.
