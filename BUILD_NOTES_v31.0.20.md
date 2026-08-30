# The Dye Ledger v31.0.20

## Save clarity and round history

- Distinguishes an authoritative primary-save failure from an unavailable last-known-good backup.
- Shows **Saved · Backup unavailable** when the primary round is safe but the redundant backup cannot be refreshed.
- Reserves **Save needs attention** for an actual primary-save failure.
- Labels stored unfinished rounds **Paused** instead of the ambiguous **Saved**.
- Orders round history by round date, then by completion/update time so the newest same-day round appears first.

## Ledger Entry actions

- Matches Ledger Entry action sizing to the Classic Scorecard’s touch-friendly controls.
- Gives report actions a consistent 44-pixel minimum target and balanced mobile wrapping.
- Moves print guidance onto its own line and explains that the header/footer setting is desktop-browser dependent.
- Clarifies that iPhone and iPad AirPrint do not expose a browser header/footer switch.

## Compatibility

- No scoring, handicap, settlement, Story, report-content, Shared Match, cloud-schema, or migration changes.
- Existing completed rounds, accepted Ledger Entries, local backups, and round dates remain compatible.
