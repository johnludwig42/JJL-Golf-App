# The Dye Ledger v28.9 Build Notes

Focused Match Summary layout enhancement.

## Included

- Ensures the first page of the Match Summary prioritizes the Round — Match Summary header and The Dye Ledger Round Recap when a recap exists.
- Keeps Games Summary on page one only when there is sufficient remaining space.
- Automatically moves Games Summary to the next page when needed so the Round Recap is not pushed off or awkwardly split.
- Preserves Round Recap paragraph formatting, font sizing, and styling.

## Not Changed

- No scoring calculation changes.
- No settlement calculation changes.
- No Round Recap generation prompt changes.
- No Supabase schema changes.
- No localStorage structure changes.
- No Classic Scorecard changes.
