# The Dye Ledger v30.3.26 Build Notes

## Release Theme
Incomplete rounds should be honest, useful, and mathematically safe.

## Changes
- Added incomplete-round completion state handling for Match Summary reporting.
- Improved provisional report copy so incomplete rounds explain that statistics and settlements are based on completed holes only.
- Changed Scorecard Snapshot language for incomplete rounds from final winner language to leader/status language where appropriate.
- Updated Round Awards so front/back nine awards are not awarded when the relevant nine is incomplete.
- Labeled Nassau and game summaries as provisional when a round is incomplete.
- Added incomplete-round scope labels to player and team leaderboards.
- Fixed Score Distribution so it counts all completed holes, including holes after an unplayed/missing hole, rather than stopping at the first missing hole.
- Added Classic Scorecard note clarifying that partial totals reflect completed/scored holes only.
- Labeled net settlement as provisional for incomplete rounds.
- Updated app version and cache metadata to v30.3.26.

## Guardrails
- No scores are fabricated or auto-filled.
- Missing holes are skipped, not counted as zero.
- Completed 18-hole rounds should continue to report normally.
- Start Scoring remains unchanged from the v30.3.25 hotfix.
