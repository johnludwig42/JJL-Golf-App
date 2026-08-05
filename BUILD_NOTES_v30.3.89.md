# The Dye Ledger v30.3.89 Build Notes

## Release objective

v30.3.89 strengthens Shared Match convergence and makes synchronization, settlements, Greenies results, golfer naming, release metadata, and Match Summary PDFs easier to trust and understand.

## Implemented

- Added a visible **Sync Now** action to Play > Round Progress.
- Manual synchronization now saves current inputs, pushes locally owned entries, pulls remote entries, compares complete score ledgers, and reports confirmed parity or the outstanding entry count.
- Shared Match completion now fails safely until the score ledger is reconciled. Local scores remain available when cloud confirmation cannot be obtained.
- Added delayed older-hole convergence coverage so a joined device's earlier score cannot be lost merely because later holes already exist on the host.
- Replaced the corrupted synchronization disclosure glyph with a CSS indicator.
- Allowed long settlement names and payment routes to wrap while reserving a stable right-aligned money column.
- Greenies Game Summary now reports every participant's current or final net position.
- Replaced cryptic turning-point headings such as “The 1-Point H9” with “Turning Point: Hole 9.”
- Added optional Preferred Name/Nickname alongside Full Golfer Name. Names remain mutable attributes and never become canonical identity keys.
- Added print preflight pagination that moves a complete fitting section to the next PDF page instead of splitting it across the remaining page space.
- Replaced the midnight placeholder with one real release build timestamp shared by the app and service worker.

## Compatibility and persistence

- The local storage key and stored round schema remain compatible.
- Existing players receive an additive `formalName` derived from their current name and an empty optional `nickname`.
- Existing local rounds, RoundRecords, Memories, course snapshots, Shared Match assignments, scores, statistics, SSP facts, Press facts, and settlements are preserved.
- No historical data is uploaded, claimed, merged, rewritten, or deleted by sign-in, synchronization, or profile normalization.

## Security and deployment

- No Supabase schema, migration, RLS policy, secret, production data, or deployment configuration changed.
- No production migration or data repair was run.
- Shared Match continues to upload only entries owned by the current assigned participant, except explicit host overrides already recorded by the existing authority model.

## Manual acceptance

- Score four golfers from two devices, including saving an earlier missing hole on the joined device after later holes have been entered. Tap Sync Now and confirm both devices converge.
- Disconnect the joined device, enter a score, verify Saved Locally, reconnect, tap Sync Now, and verify confirmed parity.
- Attempt to end a Shared Match before parity and confirm completion is blocked without losing local scores.
- Review provisional and final settlements with long names on an iPhone-width screen.
- Confirm Greenies lists every participant's net position.
- Confirm a golfer with a nickname displays the nickname while retaining the full name in Library.
- Export short and long Match Summaries to PDF and inspect section boundaries and repeating table headers.
- Confirm the footer shows the actual v30.3.89 build time rather than midnight.

## Deferred

- A complete cloud-backed golfer claim/privacy UI and provider linking.
- Amendment Session UI for completed RoundRecord corrections.
- Broader Shared Match browser automation across physical iOS devices remains a manual acceptance obligation.

