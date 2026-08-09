# v30.3.96 Constitutional Review — Identity and Shared Match Publication Repair

Authority: The Dye Ledger Constitution Version 1.0.

| Principles | Release effect | Compliance |
|---|---|---|
| 1–5, 16, 18 | Restores the approved Account, permanent Golfer Identity, Personal Golfer Library, and separate Device foundations. Initial Shared Match ownership is derived from the authenticated Account, never from a mutable profile attribute or Device. | Implements. No silent identity merge, player claim, or local-record upload occurs. |
| 2, 5 | Creates the Shared Match Owner and organizer membership atomically. Participant, Viewer, Device, and scoring assignment remain distinct concepts. | Implements. The RPC does not infer participation or scoring capability from identity. |
| 6–12 | Does not publish authoritative RoundRecords or introduce Amendment UI. Existing local reopen compatibility remains isolated. | Preserved and deferred. |
| 13–22 | No Round, competition, handicap, score, settlement, SSP, Press, or finality calculation changes. | Preserved. |
| 23 | Uses additive migrations and data-preserving rollback guidance. Existing Identity and match records are never deleted during rollback. | Implements preservation and least-destructive rollback. |

The production inventory showed a constitutional omission: Account/Golfer Identity foundation objects were absent while later Shared Match RLS activation was present. This release repairs that ordered foundation and avoids weakening RLS. The publication RPC is narrowly scoped, security-definer, schema-qualified, authenticated-only, durable-Account-only, code-format validated, Device-attributed, and Owner-conflict rejecting.

No local round is uploaded or claimed merely because an Account signs in or creates a Golfer Identity. The existing unpublished Shared Match is published only after the host explicitly retries synchronization.
