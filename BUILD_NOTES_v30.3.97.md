# The Dye Ledger v30.3.97 Build Notes

## Release purpose

This focused hotfix restores authenticated Shared Match joining while preserving the least-privilege membership policy activated in v30.3.96.

## Implementation

- Keeps `join_shared_match` as the single server-authoritative initial membership admission boundary.
- Skips the redundant direct browser membership insert after that RPC succeeds.
- Preserves ordinary post-join membership refresh, Device registration, scoring assignments, synchronization, and retry behavior.
- Adds deterministic regression coverage proving the secure RPC is used exactly once and that no anonymous membership insert privilege is introduced.

## Compatibility and persistence

- Existing local rounds, players, courses, preferences, memories, snapshots, and PWA data are unchanged.
- Existing Shared Match codes, memberships, participants, Device assignments, scores, SSP/Press facts, and settlements are unchanged.
- Sign-in and joining do not upload, claim, merge, rewrite, deduplicate, or delete historical local records.
- Scoring, handicap, competition, settlement, recap, and report calculations are unchanged.

## Database and deployment

- No migration is included or required.
- No production database, RLS policy, data, secret, deployment, or remote branch was changed during implementation.

## Manual acceptance

1. Update both devices to v30.3.97 and confirm the version in the footer.
2. Sign in on the host, create and publish a Shared Match, and confirm cloud status is synchronized.
3. On a second device, enter the `DYE-######` code and join.
4. Confirm the second device enters the match without an RLS error.
5. Assign scoring control, enter one score from each device, use Sync Now, and confirm parity.
6. Confirm local-only scoring and existing saved rounds remain available.
