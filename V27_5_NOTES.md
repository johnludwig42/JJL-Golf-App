# The Dye Ledger v27.5 notes

This is a hard corrective pass for delayed score auto-advance.

## What changed
- Bound delayed auto-advance directly to the real rendered `[data-score-player]` inputs after each score-grid render
- Added direct input/focus/keydown/blur listeners on live score inputs instead of relying only on delegated container listeners
- Kept Enter and blur as backup commit paths
- Added recent-commit duplicate protection so timer/blur/enter do not double-save or double-advance
- Hardened post-save focus movement so it resolves the live target after re-render settles

## Live input event used
- `input` on the actual rendered score input elements

## Save path used
- delayed auto-advance still commits through the existing `commitScoreInput(...)` -> `saveCurrentHole(...)` path

## Post-save focus handling
- focus target is queued before save
- after re-render, the app resolves the live input again and applies focus in a post-render step

## Duplicate-trigger protection
- recent same-value commits for the same player are ignored briefly
- stale timer generations are ignored
