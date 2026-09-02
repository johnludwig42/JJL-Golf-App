# v31.0.34 — Code Cleanup and Lint Hygiene

## Summary

This maintenance release removes retired and unreferenced code, consolidates duplicated Play-header composition, and clears the unused-code lint backlog without changing scoring, persistence, synchronization, settlement, or report calculations.

## Changes

- Permanently removes the retired hole-jump tile markup, styling, render calls, and unreachable implementation; the hole selector remains the supported navigation control.
- Extracts shared hole metadata, featured competition status, and save-state builders used by both Classic and Player Mode while retaining each mode's existing wrapper classes and output.
- Removes unreferenced legacy helpers and unused intermediate values after checking runtime, adapter, test, and string references.
- Replaces unused exception parameters with optional catch binding.
- Renames the Ledger Entry statistics label from “Double avoid.” to “No double+”.
- Adds focused parity and cleanup regression coverage.

## Lint baseline

- `no-unused-vars`: 89 → 0
- `no-unreachable`: 2 → 0
- Remaining warnings: 88 existing `eqeqeq` warnings
- Proposed warning ceiling: 88; future releases should not increase it.

## Compatibility

- No scoring, handicap, settlement, persistence, synchronization, Shared Match, or report calculation behavior changed.
- No local storage schema change or database migration is included.
