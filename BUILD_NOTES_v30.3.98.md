# The Dye Ledger v30.3.98 Build Notes

## Release purpose

This focused Shared Match reliability hotfix restores reconciliation of scores retained locally on joined Devices after secure membership activation.

## Implementation

- Keeps initial membership admission exclusively inside `publish_shared_match_owner` and `join_shared_match`.
- Changes routine membership refresh to update-only so it cannot attempt a browser-side membership insert.
- Limits joined-device routine uploads to authorized score entries; host-owned Match, team, player, assignment, and notes records remain host-controlled.
- Preserves existing local score entries after a failed upload so Sync Now can replay them after upgrade.
- Adds deterministic regression coverage for membership boundaries, role-specific write plans, and score upload ordering.

## Compatibility and persistence

- Existing local rounds, scores, players, courses, preferences, memories, snapshots, and PWA data are unchanged.
- Existing Shared Match codes, memberships, Participants, Device assignments, SSP/Press facts, and settlements are unchanged.
- No local or cloud record is deleted, claimed, rewritten, or bulk-uploaded by installation or sign-in.
- Scoring, handicap, game, settlement, recap, and report calculations are unchanged.

## Database and deployment

- No migration is included or required.
- No production database, RLS policy, production data, secret, deployment, main branch, or remote branch was changed during implementation.

## Manual acceptance

1. Update both devices to v30.3.98 and confirm the footer version.
2. Preserve the existing Shared Match and the joined Device's pending scores.
3. On the joined Device, tap Sync Now and confirm its pending-entry count reaches zero.
4. On the host, tap Sync Now and confirm the joined scores appear and completed-hole progress converges.
5. Enter one additional assigned score on each Device and confirm two-way convergence.
6. Confirm team/player setup, assignments, SSP/Press facts, and existing local rounds remain unchanged.
