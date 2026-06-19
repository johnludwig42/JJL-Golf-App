# The Dye Ledger v30.1 – Shared Scoring Polish & Setup Summary Fix

## Objective

Small polish and bug-fix release after v30.0.2 shared score sync work.

## Fixes

- Added host-facing Show Other Scores / Show Other Stats controls when host assignments are configured, allowing the host to focus on only the host-assigned players while preserving full host control when toggles are enabled.
- Moved the compact shared sync visual inline with the Scoring input title to reduce vertical space on the scoring workflow.
- Reduced Game Setup re-rendering while typing team names so mobile keyboards are not unnecessarily dismissed during edits.
- Fixed Today's Match Summary game labels so selected game config objects render as readable game names instead of `[object Object]`.

## Guardrails

- No scoring calculation changes.
- No handicap, Nassau, Match Summary, Final Net Settlement, Gross Game Detail, or stat calculation changes.
- No Supabase schema changes.
- No localStorage key or migration changes.
