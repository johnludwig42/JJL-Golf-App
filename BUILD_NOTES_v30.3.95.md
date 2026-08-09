# The Dye Ledger v30.3.95 Build Notes

## Release purpose

This narrow follow-up improves the readability of the compact live SSP hole calculation introduced in v30.3.94.

## Changes

- Keeps **Raw SSP Points**, **Take / Keep**, and **Final** as distinct calculation stages.
- Adds a separate **Multipliers** row for Bridge, Re-Bridge, and Umbee treatment.
- Preserves the collapsed **View point details** disclosure and the complete Match Summary SSP audit.
- Advances the application, cache, manifest, immutable icon references, App Notes, and release tests to v30.3.95.

## Compatibility and security

- Presentation-only change: no SSP scoring, settlement, Honors, synchronization, persistence, authentication, or database behavior changed.
- Existing local rounds, Shared Matches, and saved SSP facts remain compatible.
- No database migration is required or included.
- No production Supabase configuration or data was changed.

## Manual acceptance

- Confirm the live preview displays Raw SSP Points, Take / Keep, Multipliers, and Final on separate compact rows.
- Confirm point details remain collapsed by default and expand correctly.
- Confirm a Bridge, Re-Bridge, or Umbee result appears only on the Multipliers row.
- Confirm the displayed Final totals still agree with the detailed calculation and Match Summary audit.
