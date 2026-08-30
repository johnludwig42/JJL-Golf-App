# The Dye Ledger v31.0.18

## One canonical Story of the Round

- Replaces the separate user-facing Match Summary report with one Story of the Round workflow: generate, review, edit, and save.
- Requires a reviewed and saved Story before a new Ledger Entry can be opened, so the Ledger never silently substitutes a second narrative.
- Uses the saved Story verbatim in the Ledger Entry and preserves accepted Ledger snapshots without regeneration.
- Gives the Story generator access to Partnership Performance while instructing it to tell a concise round narrative instead of inventorying statistics.
- Keeps factual verification strict for fabricated or unverifiable claims while treating optional analytical observations as non-blocking.

## Hole-preserving Ham & Egg Rating

- Keeps the existing Hand-Off calculation and its opportunity denominator unchanged.
- Defines the Ham & Egg Rating as actual handoffs divided by every possible adjacent-hole transition: 17 for an 18-hole round or 8 for a nine-hole round.
- Displays the rating as a whole number on a 0–100 scale and shows an em dash until the selected round is complete.
- Removes hypothetical best-alignment and stacked-alignment score concepts from the calculation and report.
- Retains Partnership Gain, contribution, rescue, tie, and Hand-Off details because each remains based on the actual hole sequence.

## Compatibility

- Existing saved Story and accepted Ledger fields remain compatible; no data migration is required.
- Underlying legacy summary rendering helpers remain available for old records and automated compatibility checks, but are no longer exposed as a report choice.
- Classic Scorecard, scoring, settlement, Shared Match, persistence, sync, Course Library, and stat capture are unchanged.
- No database migration.
