# The Dye Ledger v30.0 Notes

## Purpose

Reliability correction for the v29.3 multi-round session foundation.

## Fix

- Adds persistent completed-round next-step actions to the Match Summary / scoreboard area.
- Ensures a completed round loaded from saved history still offers:
  - View Match Summary
  - Play Another Round with This Group
  - Start Completely New Match
- Preserves the v29.3 completion modal for the immediate finish-round flow.

## Root Cause

The v29.3 next-step actions were only displayed as a transient modal after `completeActiveRound()`. If the app was refreshed, relaunched, or a completed saved round was loaded later, the modal was gone and there was no persistent UI path to start another round with the same group.

## Scope

No scoring, handicap, Nassau, Supabase schema, synchronization, localStorage key, or data model changes.
