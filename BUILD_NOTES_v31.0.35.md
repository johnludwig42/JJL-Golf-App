# The Dye Ledger v31.0.35

## Score and stat entry reliability

- Resolves score and stat controls inside the active Classic or Player Mode container so retained hidden markup cannot intercept an edit.
- Clears inactive score-entry markup only after the shared model save path has run.
- Replaces Classic's assumed two-putt value with an explicit Putts selection, including a 6+ entry path, while preserving unknown GIR propagation.
- Aligns Classic and Player Mode fields with None, Casual, Enhanced, and Grind stat modes.
- Adds independent Grind bunker-involvement capture while retaining a bunker recovery lie as a compatibility floor.
- Aligns Player Mode's shared header actions at the lower-right and preserves the v31.0.34 shared header builders.
- Corrects the Player Mode contract to document the four-editable-golfer Grind limit.

## Compatibility

- No scoring, handicap, competition, settlement, synchronization, reporting calculation, storage schema, or migration changes.
- Existing Enhanced recovery-by-lie and sand-save meanings are unchanged.
- Values hidden after changing Play or stat mode remain in the round model.
