# The Dye Ledger v27.27 Build Notes

## Create New Match reset fix
- Removed dead `scoreAdvanceTimers` and `scoreAdvanceGenerations` references from `startCleanNewMatchSetup()`.
- These variables were not declared anywhere in `app.js` and could crash the Create New Match reset after the prior `pendingScoreFocus` fix.
- No scoring, payout, PDF/export, or Classic Scorecard logic changed.

## QA
- Verified `grep -n "scoreAdvanceTimers\|scoreAdvanceGenerations" app.js` returns zero matches.
- Verified `grep -n "pendingScoreFocus" app.js` returns zero matches.
- Ran `node --check app.js` successfully.
