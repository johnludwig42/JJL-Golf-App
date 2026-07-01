# Build Notes v30.3.29

## Release Theme
Hole Sequence Navigation Fix.

## Changes
- Added selected-hole sequence navigation helpers so live play follows the current match sequence instead of assuming Hole 18 is always terminal.
- Updated Save Hole / Next Hole behavior so full 18-hole rounds can wrap from Hole 18 to Hole 1 when play starts on the back nine or another non-Hole-1 start.
- Updated manual hole dropdown handling so Save/Next advances from the selected hole in the active sequence.
- Changed finish-round prompting so Hole 18 only triggers the completion workflow when it is truly the final selected hole and all selected holes are complete.
- Preserved back-nine-only and standard Hole 18 finish workflows when those rounds are complete.

## Guardrails
- No scoring, settlement, handicap, Supabase, Course Library, Shared Match, localStorage, or service-worker behavior changes beyond version/cache metadata.
- No scores are fabricated or auto-filled.
- Existing completed-round and incomplete-round reporting behavior is preserved.
