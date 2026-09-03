# The Dye Ledger v31.0.38

## Guided post-round Ledger workflow

- Makes every completed host-round Story save continue into that same round's Ledger Entry preview, including reopened saved rounds that already had a Story.
- Renames the primary Story action to **Save Story & Preview Ledger** so the next step is explicit.
- Adds a compact Finish Up progress indicator for Round saved, Story review, and Ledger finalization.
- Preserves validation behavior: invalid Story edits remain in review and do not open the Ledger.
- Preserves Shared Match authority: joined devices remain read-only while the host reviews and finalizes the Story and Ledger Entry.

## Verification

- Focused automated coverage includes draft and previously saved Stories, early and full completed rounds, reload, correct-round Ledger routing, progress states, and joined-device authority.
- Full application test, lint, validation, and simulation comparison gates are required before release.
