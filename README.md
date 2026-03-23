# The Dye Ledger – Hotfix / Release 2A (v13)

This build focuses on the specific issues and feedback from the latest round of testing.

## Included fixes
- **Momentum chart** now uses **one selected team game at a time** instead of mixing multiple games.
- Added a **Momentum Game** selector on the leaderboard.
  - Defaults to **Nassau** when Nassau is selected.
  - Other supported sources: **Team Match Play** and **Team Stroke Play**.
  - Momentum is shown from **Team 1's perspective**.
- **Greenies participants** in match setup are now limited to players actually assigned to that match.
- On **par 3s**, if Greenies is selected, the score-entry screen now shows a **winner selector** for the eligible Greenies participants.
- **Stroke-index carry-forward** for new tees was tightened so a course default can prefill the new tee more reliably.
- Storage key bumped with backward-compatible fallback loading.

## What to retest
1. Create / edit a match with Nassau and another team game; confirm the **Momentum Game** dropdown appears and defaults to Nassau.
2. Confirm momentum pills now progress hole-by-hole from **Team 1's perspective** without double-counting.
3. Set up Greenies and confirm only **players in the match** are available as Greenies participants.
4. On a **par 3**, confirm a Greenies winner control appears and saves correctly.
5. Add a new tee to a course that already has saved stroke indexes on another tee and confirm the new tee prefills those indexes.

## Deploy
Replace the contents of your `golf-app` folder with this build, commit, refresh Safari, and re-add the home-screen app if needed.
