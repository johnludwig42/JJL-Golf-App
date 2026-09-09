# The Dye Ledger v31.0.43

## Wolf Test Coverage and Adapter Metadata

- Adds direct coverage for all sixteen standard Wolf rotation positions.
- Pins the low-points final-hole assignments, saved standings, rotation-order tie-break, and no-early-freeze behavior.
- Verifies Lone Wolf against the best ball of all three opponents.
- Reconciles the standard Wolf fixture to 36 distributed points and exact six-pair head-to-head amounts.
- Adds `computeWolfResults` to live-adapter coverage metadata and confirms no other Wolf simulation function is omitted.
- Preserves Wolf scoring, settlement, presentation, persistence, and local-only Shared Match behavior without a database migration.

## Release gate

- The focused v31.0.43 suite, full test suite, simulation comparison, validation, release sanity, lint, and diff checks are required before release.
