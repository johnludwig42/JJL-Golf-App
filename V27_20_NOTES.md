# The Dye Ledger v27.20 Build Notes

Narrow Handicap Preview layout/UI refinement.

## Changes

- Updated Handicap Preview styling so each player's data fields remain on one horizontal line.
- Kept the existing data order: Player | Tee | Index | Course HCP | Playing | Gets.
- Added nowrap behavior and scoped horizontal scrolling inside Handicap Preview cards as the small-screen fallback.
- Tightened only Handicap Preview spacing/font behavior for mobile readability.

## Guardrails

- No scoring calculation changes.
- No handicap formula changes.
- No payout logic changes.
- No PDF/export architecture changes.
- No Classic Scorecard rendering or styling changes.

## QA Summary

- Verified JavaScript syntax with node --check app.js.
- Verified v27.20 version markers in app files and service worker cache name.
- Verified Handicap Preview CSS is scoped to .handicap-preview-* selectors and does not alter other tables/layouts.
