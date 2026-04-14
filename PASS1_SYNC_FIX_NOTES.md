Pass 1.1 sync fix (v27.1)

What changed
- Shared match uploads now include normalized `score_entries` rows for every player + hole, including gross score and hole stats.
- Shared match uploads now upsert `match_notes` for the current match-scoped notes value.
- Live scoring saves now schedule a cloud sync for shared matches after score/stat edits.
- Finish-round now triggers an immediate cloud sync for shared matches so completed status persists.
- Notes edits now schedule a cloud sync for the active shared match.

Scoring/state paths that now trigger shared cloud sync
- Save Hole / Next Hole flow (`saveCurrentHole`)
- Hole score edits captured through the main scoring save path
- Hole stat edits captured through the main scoring save path
- Progress state derived from scoring edits (`lastTouchedHole`, `lastFullyCompletedHole`)
- Finish Round (`completeActiveRound`)
- Notes box edits for the active shared match

Version
- App version advanced from v27.0 to v27.1.
