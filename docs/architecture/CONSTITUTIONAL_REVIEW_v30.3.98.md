# v30.3.98 Constitutional Review

## Scope

This release narrows routine Shared Match writes so a joined Device can reconcile its assigned scores without attempting membership admission or rewriting host-owned setup records.

## Principles implemented or protected

- **Principles 1, 2, and 5 — Ownership and Round Roles:** host administrative authority remains distinct from joined scoring capability.
- **Principles 3, 4, 16, and 18 — Identity separation:** Account, Golfer Identity, Participant, Device, and scoring assignment remain separate concepts.
- **Principles 6, 7, and 10 — RoundRecord and versioned history:** locally retained scores are replayed additively; no historical record is silently rewritten or deleted.
- **Principles 13 and 19 — Round integrity and independent lifecycles:** synchronization changes do not alter scoring, games, settlement, or Round lifecycle behavior.

## Security boundaries

- Membership creation remains server-authoritative through the existing security-definer RPCs.
- Routine browser membership activity is update-only.
- Joined Devices cannot use routine synchronization to rewrite host-owned Match, team, player, assignment, or notes records.
- Score writes remain protected by authenticated membership RLS and existing assignment-aware application filtering.

## Compatibility conclusion

No constitutional conflict was identified. The change strengthens least privilege while preserving offline-first scoring, existing local data, Shared Match codes, Participants, Device attribution, and pending-score recovery.
