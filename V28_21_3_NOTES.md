# The Dye Ledger v28.21.3

Focused Stat Tracking Matrix Golf Logic Fix release.

## Changes

- Reordered the Stat Tracking Matrix columns to follow golf workflow: FW, GIR, U&D, Sandy, Putts, Pen.
- Preserved dynamic column behavior so only enabled stat categories appear.
- Confirmed Putts steppers support 0, 1, and higher values with a floor of 0.
- Preserved Penalty Stroke steppers with a floor of 0.
- Added golf-aware Putts default behavior so checking Up & Down or Sandy sets Putts to 1 when Putts is still default/auto, while preserving manual overrides.
- Ensured stat matrix checkbox changes immediately apply current-hole stat state before saving.
- Updated app version references to v28.21.3.

## Scope

- No changes to score entry workflow.
- No changes to scoring, handicap, settlement, game, Match Summary, AI Recap, Supabase, localStorage, or saved-match schemas.
