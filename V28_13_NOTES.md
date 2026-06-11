# The Dye Ledger v28.13 Build Notes

Focused Nassau settlement and Match Summary reliability release.

## Included

- Fixed Nassau payout inclusion in Gross Game Detail and Final Net Settlement when Nassau is selected and has non-zero wagers.
- Preserved Nassau scoring, Games Summary, and Momentum Chart behavior while ensuring payout aggregation recognizes Nassau basis-specific payout rows.
- Added defensive display language for selected Nassau games with blank or zero wagers: "Nassau enabled with no wager configured."
- Updated Match Summary export window URL/version handling so generated PDF footers use the current app version instead of stale query-string values where supported by the browser.

## Not changed

- No Nassau rule changes.
- No scoring or handicap calculation changes.
- No settlement engine redesign.
- No Supabase schema changes.
- No localStorage migration.
- No Classic Scorecard, Round Recap, or course sync changes.
