# The Dye Ledger v30.0.3 – Shared Score Sync Reliability & Clean Scoring Input

## Release Theme
Score cleanly. Sync quietly.

## Root Cause
v30.0.1 still used a whole-match shared upload path that deleted and reinserted `match_teams`, `match_players`, and `score_entries` on sync. Because `score_entries` reference `match_players` with cascade delete behavior, one device could erase or overwrite another device's score entries during normal synchronization.

## What Changed
- Replaced destructive shared score sync with entry-level upsert behavior.
- Devices upload score/stat entries only for players assigned to that device.
- Remote score/stat entries are pulled and merged into the local match without overwriting locally-owned assigned-player entries.
- Sync Now now flushes local changes, refreshes participants/assignments, and pulls latest remote scores.
- Added 30-second lightweight score refresh only while the app is visible, the round is active, and the Score or Scoreboard context is in use.
- Added foreground/online score refresh.
- Removed large shared-match admin/status content from Scoring Input and replaced it with a compact sync indicator.
- Added Show Other Scores and Show Other Stats toggles for joined-device assigned scoring.

## Supabase
No Supabase schema changes were made. v30.0.3 reuses existing shared match tables and changes client-side sync behavior from destructive replacement to entry-level upsert/merge.

## Guardrails Preserved
- No scoring engine changes.
- No handicap calculation changes.
- No Nassau calculation changes.
- No Match Summary calculation changes.
- No Final Net Settlement calculation changes.
- No stat calculation changes.
- No Course Library schema changes.
- No localStorage key changes.
