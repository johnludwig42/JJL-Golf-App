# BUILD_NOTES_v30.3.44.md

Build v30.3.44 - Scoring & Setup Polish

## Summary
This release polishes the scoring and setup experience without changing golf scoring, game logic, settlements, reports, or saved data models.

## Changes
- Increased Smart Score Advance timing presets by exactly 200 ms:
  - Fast: 400 ms
  - Normal: 500 ms
  - Relaxed: 700 ms
- Preserved existing Smart Score Advance preset keys for saved matches and match templates.
- Improved mobile safe-area spacing for the Exit Round Early / Round Complete prompt.
- Applied the same low-risk mobile modal spacing fix to the post-round actions prompt.
- Kept bottom-sheet dialogs unchanged.
- Updated app version and cache references to v30.3.44.

## Verification Focus
- Confirm Smart Score Advance still triggers only after all active scoring rows have gross scores.
- Confirm Fast, Normal, and Relaxed timing feel steadier without changing scoring behavior.
- Confirm saved matches and templates with Smart Score Advance presets still load correctly.
- Confirm Exit Round Early is fully visible beneath sticky navigation on iPhone Safari and installed PWA.
- Confirm post-round actions prompt is fully visible beneath sticky navigation on iPhone Safari and installed PWA.
- Confirm desktop modal behavior remains unchanged.
- Confirm Recent App Errors remains empty during normal scoring and setup workflows.
- Confirm installed PWA refreshes to cache `the-dye-ledger-v30.3.44`.
