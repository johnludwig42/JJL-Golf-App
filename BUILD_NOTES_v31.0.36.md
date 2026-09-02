# The Dye Ledger v31.0.36

## Post-round Story review reliability

- Routes **Review Story** into the dedicated Scores → Story destination before expanding and scrolling to the generated Story.
- Uses one authoritative Story-review opener for shortened rounds, fully completed rounds, and completed rounds reopened from Saved Rounds.
- Re-establishes the completed-round review pointer before rendering so the Story, editing controls, and subsequent Ledger Entry use the same round.
- Reopens the Story surface after asynchronous generation so a rerender cannot leave the completed draft hidden.
- Preserves visible recovery routing to Saved Rounds when the completed round can no longer be resolved.
- Adds a real headless-browser mobile regression covering both shortened and full rounds before and after an app reload.

## Compatibility

- No score, handicap, Nassau, settlement, statistics, synchronization, Story-generation, report-content, or storage-schema changes.
- Accepted Stories and Ledger Entry snapshots retain their existing frozen behavior.
- The v31.0.35 100-round 2-v-2 Nassau matrix completed without calculation or statistics-report failures before this correction was implemented.
