# The Dye Ledger v31.0.13

## Player Mode clarity and round flow

- Consolidates hole facts, the featured match result, entry progress, save/sync state, and overflow actions into one sticky Player Mode header.
- Removes the duplicate Player Mode match-status block, header Save & Next action, and redundant Scoreboard overflow action.
- Opens the first editable golfer who still needs a score or required statistics when a hole is entered; completed holes remain collapsed.
- Keeps the persistent bottom Save & Next Hole and Scoreboard actions as the primary scoring workflow.
- Moves End Round Early into the overflow during play and promotes round-ending controls at the final-hole or completed-score context.
- Distinguishes local saved state from Shared Match device sync, offline, and attention states.

## Compatibility

- Classic Mode rendering and scoring controls are unchanged.
- Score, statistic, persistence, and Shared Match synchronization data models are unchanged.
