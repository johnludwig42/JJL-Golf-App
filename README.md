# The Dye Ledger — Hotfix v12

This build focuses only on the blockers you reported:

- fixes the missing gambling game selector
- fixes Create Match so matches save and load correctly
- improves player-slot dropdown behavior so available players do not disappear unexpectedly
- improves Add Tee behavior from Saved Courses & Tees
- keeps course/tee selections more stable during match setup
- enforces 18-hole stroke index entry totaling 171 before saving a tee

## Update steps
1. Replace the contents of your existing `golf-app` folder with these files.
2. Commit and push to GitHub.
3. Open the live site in Safari and refresh.
4. If the home-screen app still shows the old behavior, delete it and re-add it.

## What to retest
- gambling games appear and can be selected
- Create Match creates and loads the match
- player dropdowns show all untaken players
- Add Tee opens the tee editor with the course preselected
- tee save blocks invalid stroke indexes
