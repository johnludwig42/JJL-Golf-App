# Golf Matchbook PWA v7

This version keeps the manual and editable course/tee workflow, but adds:

- compact iPhone-first layout
- match setup by date
- 2 to 6 players
- team assignments for singles, doubles, or threesomes
- hole-by-hole score entry
- live leaderboard tab
- player totals, team totals, skins, and Nassau-style front/back/overall summaries
- double-confirm round completion

## Update steps

1. Replace the contents of your existing `golf-app/` folder with the files in this package.
2. Commit the changes in GitHub.
3. Open the live site in Safari and refresh.
4. If the home-screen app still shows the older version, delete it and add it again.

## Notes

- Data is still stored locally on the device in this version.
- Code deploys should not wipe local data unless you clear browser storage.
- Supabase can be added later so players, courses, matches, and results sync across devices.


Version v8 note: course-level stroke index templates now carry forward to new tees on the same course unless you manually change and save the tee.


Version 9 adds scorecard sharing from completed or in-progress rounds using the iPhone share sheet when available, with clipboard/mail fallback. This update preserves existing local data by loading prior saved state and extending it without clearing storage.
