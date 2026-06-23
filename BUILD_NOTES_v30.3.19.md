# The Dye Ledger v30.3.19

## Release Theme
Scores Tab State Cleanup and Build Date Diagnostics.

## Changes
- Added an active-round guard so missing-score diagnostics do not render when there is no active round.
- Updated the Scores tab no-active-round state to show a neutral message: start scoring to generate reports and summaries.
- Hardened hidden/collapsed Scores tab elements so they do not overlap visible content or leave stray UI fragments.
- Replaced the ambiguous footer timestamp with an explicit Build Date label.
- Updated build/version displays and service-worker cache keys to v30.3.19.

## Guardrails
- No scoring, settlement, handicap, Supabase, Course Library, Shared Match, saved-match, or localStorage schema changes.
- No automatic score filling or fabricated scores.
