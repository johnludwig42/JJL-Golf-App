# The Dye Ledger v30.3.81 Build Notes

## Competition Rules & Handicap Trust

- Adds Competition Rules Catalog version 1 for all currently supported games.
- Shows the saved basis, scoring method, handicap treatment, tie behavior, stake meaning, escalation behavior, and finality in Match Setup.
- Applies WHS handicap allowances to the unrounded Course Handicap and rounds only the final Playing Handicap.
- Adds explicit Gross and Net Skins carryover configuration.
- Settles carried skins using the accumulated skin value exactly once.
- Preserves legacy Skins configurations without silently changing historical settlement behavior.
- Removes the redundant Match Setup readiness checklist; destination status badges remain authoritative.
- Routes a failed Start Round attempt to the first destination that needs attention while retaining specific validation feedback.

## Compatibility

- Existing local rounds, players, courses, templates, preferences, memories, snapshots, scores, SSP facts, Press records, settlements, Shared Match data, and PWA storage remain additive and compatible.
- No automatic upload, historical rewrite, claiming, deletion, or production Supabase change is included.

## Deferred

- Full game-library expansion.
- Amendment Session UI.
- Event Edition.
- Stand-alone Play Mode UX.

