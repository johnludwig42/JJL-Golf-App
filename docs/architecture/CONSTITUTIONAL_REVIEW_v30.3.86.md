# v30.3.86 Constitutional Review

v30.3.86 implements and protects Constitution Principles 1, 6, 7, 8, 9, 10, 11, 12, 16, 22, and 23.

- One authoritative Nassau engine now supplies competitive status, recap facts, Scores presentation, Match Net views, and settlement. A Round therefore has one competition truth rather than surface-specific interpretations.
- Game Handicap calculation follows the saved Round policy: apply the allowance to each unrounded Course Handicap, round each Game Handicap, and then allocate relative strokes from the lowest rounded Game Handicap.
- Existing Course Net facts remain separate from Match Net facts. No historical score, local round, or RoundRecord is uploaded, claimed, rewritten, deduplicated, or deleted.
- Direct Memory editing remains available for active local rounds. Completed or frozen rounds are read-only pending Amendment Sessions, preventing a living presentation from diverging from its authoritative RoundRecord.
- Shared Match Memories remain append-only until revision-aware, conflict-safe synchronization is implemented. This avoids silent last-writer-wins correction loss while preserving Memory creation and offline scoring.
- Diagnostic output excludes Memory text, player details, assignments, course identifiers, and full failure payloads. Detailed diagnostics require explicit local debug enablement.
- Unequal-team Nassau settlement is explicit: each losing player owes one component stake and the collected amount is divided equally among the winning players.

No constitutional conflict remains in the implemented scope. The deferred full Amendment Session UI is the constitutional replacement for completed-round corrections. v30.3.86 adds no cloud ownership, identity claim, server deployment, database migration, or production policy change.
