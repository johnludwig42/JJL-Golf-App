# v31.0.33 — 9-Point Presentation

## Summary

This focused release makes the three-player 9-Point game legible and auditable in active-play headers and the Ledger Entry report without changing its scoring or settlement.

## Changes

- Shows ranked, first-name 9-Point totals through the authoritative shared header status path.
- Groups tied totals explicitly instead of implying an order.
- Uses direct end labels and distinct categorical colors for individual cumulative chart lines.
- Emphasizes all three supported 9-Point participants and removes the irrelevant top-three note.
- Adds a print-safe hole-by-hole 9-Point points table with blank unplayed holes.
- Limits report calculations and presentation to the three configured 9-Point participants, even when the round roster is larger.
- Adds a dedicated 9-Point layout fixture and release regression coverage.

## Data and compatibility

- No scoring, handicap, settlement, synchronization, Shared Match, or persistence behavior changed.
- No localStorage schema change or database migration is included.
- Per-hole report values consume the existing authoritative `pointsByHole` report field; missing holes remain unknown.
