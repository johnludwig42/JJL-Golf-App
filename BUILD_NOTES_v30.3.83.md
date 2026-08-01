# The Dye Ledger v30.3.83 Build Notes

## Summary

v30.3.83 makes Play current-hole-first, makes PWA updates clear and verifiable, improves Quick Scoreboard chart legibility, and adds an auditable round-level Approach Performance foundation. It preserves existing scoring, game calculations, Shared Match behavior, Add Memory, and the complete Quick Scoreboard.

## Approach Performance

- Increased Quick Scoreboard momentum axis and point-value typography without changing chart geometry or competitive calculations.
- Added GIR after a fairway hit, GIR after a fairway miss, and Fairway GIR Advantage for tracked players.
- Uses completed par 4 and par 5 holes only and displays both percentages and success/opportunity counts.
- Fairway GIR Advantage requires at least two opportunities from both fairway outcomes; smaller comparisons are labeled as limited samples.
- New RoundRecords preserve the four underlying counts additively. Existing RoundRecords and local rounds remain unchanged and readable.
- Rounds without eligible tracked facts show an explicit availability explanation instead of silently hiding Approach Performance.

## Play Focus

- Removed the redundant Play-level **Scoring input** title and verbose metadata above hole navigation.
- Made hole navigation the first actionable control.
- Preserved current-hole Par, Stroke Index, Featured Competition status, scoring, games, statistics, Save Hole, and automatic advance.
- Kept Add Memory in its established position.
- Added compact **Round Progress** after Add Memory, with secondary round details and Finish Round controls below it.
- The Quick Scoreboard structure, calculations, disclosures, and behavior remain unchanged; only momentum-label typography is strengthened.

## Reliable App Updates

- An active incomplete round or the Play tab alone no longer blocks an update.
- Updates pause for actual unfinished work: unsaved visible scores, open consequential dialogs, setup initialization, scorecard import, or Course Library loading.
- The app performs a final local-state save before activating an update and stops safely if that save fails.
- Update messaging distinguishes checking, current, ready, installing, paused, failed, and successfully updated states.
- Available and installed versions are shown when known.
- The app waits for a newly installing service worker rather than immediately reloading the old build.
- After activation and reload, the app confirms the installed version.
- Unsupported file/embedded preview contexts receive plain guidance instead of a technical service-worker failure.
- The waiting-worker model remains intact; no update forces a mid-entry reload.

## Compatibility and Boundaries

- No scoring, handicap, settlement, game, Press, SSP, Shared Match, Course Library, authentication, or cloud schema changes. RoundRecord receives only optional derived-source counts for new records.
- No localStorage key change or destructive migration.
- Existing local rounds, courses, players, templates, preferences, Memories, and PWA data remain additive and compatible.
- No Supabase migration or production change is included.

## Manual Acceptance

- On iPhone, confirm Play opens with hole navigation first.
- Score and save a hole; confirm advance and scroll behavior remain correct.
- Add a Memory and confirm Round Progress appears directly afterward.
- Open and exercise the complete Quick Scoreboard.
- With a saved active round, install a waiting update and confirm the new version after reload.
- With an unsaved visible score, confirm installation pauses until Save Hole completes.
- Confirm offline scoring and a later online update check both remain available.
