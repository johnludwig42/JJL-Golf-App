# The Dye Ledger v31.0.17

## Partnership Performance refinements

- Replaces the ambiguous “strokes saved” measure with Partnership Gain: the better partner’s eligible-hole total minus the team’s actual best-ball total.
- Presents Ham & Egg Rating on an explicit 0–100 scale, separate from contribution balance and Partnership Gain.
- Uses accurate Hand-off opportunities based only on adjacent eligible holes with sole contributors.
- Shows percentage-and-fraction context for counted holes, ties, hand-offs, and both partners’ rescues, including zero results.
- Clarifies the actual, best-alignment, and stacked-alignment audit values without changing authoritative scoring or settlement.

## Story and leaderboard

- Supplies eligible Partnership Performance facts to the generated Story of the Round and to the verified deterministic fallback.
- Allows a modestly longer Story while retaining fact verification and repair safeguards.
- Adds each golfer’s Postable adjusted gross to the Player Leaderboard with a handicap-purpose explanation.
- Renames the leaderboard scoring column to Bird+ to match its birdie-or-better calculation.

## Report presentation and pagination

- Removes redundant heavy section rules and applies consistent thin underlines and category spacing.
- Adds more visual separation between the two Appendix scorecards.
- Safely uses more of the printable page while preserving the iOS print-surface protection against blank trailing sheets.
- Prevents on-screen overflow diagnostics from appearing in printed or saved PDFs.

## Compatibility

- No scoring, settlement, Shared Match, persistence, sync, Course Library, Supabase, or schema changes.
- Existing accepted Ledger Entry snapshots remain frozen and readable.
- Missing optional statistics continue to render as unavailable rather than failing the report.
- No database migration.
