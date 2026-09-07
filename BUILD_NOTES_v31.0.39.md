# The Dye Ledger v31.0.39

## Play header and combo-tee clarity

- Shows every Player Mode golfer's actual source tee and yardage for the current hole in the collapsed row as well as the expanded entry card.
- Uses the same authoritative per-player, per-hole combo-tee resolver as Classic Mode, including frozen course snapshots.
- Aligns Classic Mode's save state, Scoreboard, and overflow actions in one compact action group beside the hole and match context.
- Uses a responsive header row at normal phone widths and a safe stacked fallback on exceptionally narrow screens.
- Does not change scores, statistics, handicaps, persistence, Shared Match synchronization, or reports.

## Verification

- Browser coverage verifies combo-tee source labels and yardages for Player Mode at a 390px phone viewport.
- Browser coverage verifies Classic header alignment and horizontal containment at the same phone viewport.
- Focused Player Mode, Classic navigation, combo-tee snapshot, and mobile scoring tests are required alongside the full application suite.
