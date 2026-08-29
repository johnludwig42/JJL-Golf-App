# The Dye Ledger v31.0.15

## Accepted Ledger Entry snapshots

- Opens a newly generated Ledger Entry for review before printing.
- Adds explicit Accept & Finalize and Print / Save PDF actions.
- Preserves the accepted Story of the Round and complete report-data snapshot with the completed round.
- Reopens an accepted Ledger Entry without regenerating its story or making another AI request.
- Records acceptance time, app version, calculation-rules version, and story provenance.
- Provides a warned Unlock & Regenerate path and invalidates an accepted report when its completed round is reopened for correction.
- Synchronizes host-accepted Ledger Entries through Shared Match metadata.

## Installed-app reliability

- Advances the application, service-worker cache, manifest, immutable branding assets, and app-shell queries to v31.0.15.
- Aligns every Ledger report script and module URL with v31.0.15 so Safari and installed PWAs cannot combine the new report controls with an older cached renderer.
- Adds regression coverage for accepted report reuse, revision handling, explicit PDF actions, and the version-aligned Ledger asset chain.
- Presents each front, back, or other margin segment from that segment winner's perspective, defaults tied segments to Team 1, resets the running margin at the start of every segment, and labels the chosen perspective explicitly.

## Compatibility

- Scoring, statistical calculations, settlement, Match Summary recap behavior, and existing completed-round data are unchanged.
- Incomplete rounds remain reviewable but cannot be accepted as final Ledger Entries.
