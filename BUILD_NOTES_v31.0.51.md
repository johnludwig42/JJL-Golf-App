# The Dye Ledger v31.0.51 — Wager Balance Explanations

## Behavior

- Tap a golfer's balance in Scores settlement or Quick Scoreboard to see the contribution of each selected game. Expand a game for its results, stakes, counting scores, handicap strokes, point awards, skins, Greenies or press ranges where available.
- Uses existing payout and result calculations. No independent wager engine, payment tracking or scoring-rule changes.
- Live and incomplete results are projected. Frozen rounds use recorded game amounts and net positions; captured press details are included in their parent totals, not added twice. Missing historical detail is labeled rather than reconstructed from changed live scores.
- Contributions cross-foot to the displayed balance. If a legacy record lacks matching detail, the discrepancy is shown explicitly.
- Changes compare with the golfer's previous review while the app stays open. Changed gross scores identify corrected holes; game-level deltas show contribution changes. This comparison is not a permanent correction journal and is reset on reload.
- Quick Scoreboard's unsaved on-screen preview is explained using the same preview data and clearly labeled. Opening an explanation never saves the preview.
- Keyboard focus returns to the invoking balance; Escape closes the explanation while preserving an underlying Quick Scoreboard.
- Quick Scoreboard no longer labels an early-ended round Final solely because it has a completion timestamp; it uses the same settlement-finality conditions as Scores.

## Verification

- 50 varied-round explanation scenarios passed for every golfer, matching authoritative payout totals and leaving scores unchanged.
- All 296 regression checks passed, including saved-round/lifecycle, score-entry, report and saved-setup coverage. Explanation checks cover frozen totals, root/re-press attribution, missing historical detail, cent rounding, early-ended provisional results, actual score corrections, unsaved Quick Scoreboard previews, focus restoration and Escape behavior.
- Scoring comparison: 50 random rounds plus 27 fixed fixtures, zero failures and zero live/mirror differences. The simulator reported 56 informational warnings and one settlement-size review flag; these are not calculation differences.
- Phone layout at 375px was visually reviewed and the tested dialog has no horizontal overflow. Clear game expansion cues and long-name wrapping are included.
- Release validation and whitespace checks passed. Lint: zero errors and 88 existing warnings.

## Deployment and acceptance

No Supabase migration. Branch: `codex/v31.0.51-wager-explanations`. No commit, push, merge or production deployment performed by Codex. Real four-device cloud/PWA acceptance and live verification of the prior release remain separate open gates; this implementation does not substitute synthetic tests for those gates.

Manual acceptance: review live and saved balances, expand a game, correct a score and compare the next review; confirm a joined read-only scorer can inspect balances without editing authority; check actual iPhone focus, scrolling and PWA behavior.
