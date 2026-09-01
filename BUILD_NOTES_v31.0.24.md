# v31.0.24 — Round Lifecycle and Post-Round Clarity

## Summary

This release closes a completed round as a live scoring session while keeping its Story, Ledger Entry, scorecards, statistics, and Memories available through a separate completed-review context.

## Changes

- Clears the live-round pointer after normal or early completion and opens the finished round for review.
- Restores immediate Create Match and Join Match availability without losing post-round review.
- Distinguishes completed-round View, unfinished-round Load, and deliberate Reopen behavior.
- Keeps completed Story, Ledger Entry, classic scorecards, player details, and Memories bound to the reviewed round.
- Adds a guarded local Discard Round action with Shared Match and financial-result warnings.
- Moves Add Memory above Player Mode’s sticky hole header on mobile.
- Shows joined scorers that the host must complete the match and transitions them to review when cloud completion arrives.
- Makes Story generation state explicit before Review Story becomes available.

## Compatibility

- No database migration or local-storage schema change.
- No scoring, handicap, competition, settlement, synchronization protocol, or Ledger Entry layout change.
- Existing saved and Shared rounds remain compatible.
