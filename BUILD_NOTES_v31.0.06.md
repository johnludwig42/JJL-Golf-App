# The Dye Ledger v31.0.06 — Play Input-Mode Foundation

## Scope

- Defines a versioned Play input-mode registry and shared controller contract over the authoritative Round data.
- Preserves the existing multi-golfer Play experience as Classic Mode.
- Adds a device-only Score Entry Mode preference and a compact selector on Play.
- Registers Player Mode as unavailable and fails safely back to Classic until the redesigned renderer ships.
- Saves the current visible hole before any future mid-round mode switch; a failed save blocks the switch.
- Leaves scoring calculations, competitions, stat derivation, Shared Match synchronization, settlement, RoundRecords, and reports unchanged and shared by every mode.

## Compatibility

- Existing preferences migrate additively to schema version 5 with Classic Mode selected.
- No Round or Match schema changes are introduced.
- No database migration is required.
- Existing rounds open and score through the same Classic controls and persistence path.

## Verification

- Focused input-mode, mobile scoring, and preference tests.
- Full application regression suite.
- Scoring simulation comparison and release validation.
