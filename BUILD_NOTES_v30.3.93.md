# The Dye Ledger v30.3.93 — Production Security Activation

## Scope

- Adds a membership-scoped Shared Match authorization boundary and secure join RPC.
- Preserves temporary anonymous-auth joined devices, offline/local scoring, host reconciliation, and DYE/legacy codes.
- Removes global authenticated access policies and direct browser access to access-code records.
- Makes audit inserts append-only and binds actor attribution to `auth.uid()`.
- Keeps Course Catalog reads public while restricting writes to durable allowlisted Accounts.
- Adds transactional preflight/postflight row-preservation and relationship-integrity gates.

## Deployment status

The migration has **not** been applied to production. Account activation remains disabled. Production application requires the separate runbook gates, backup, explicit target confirmation, disposable-environment policy tests, and Product Owner approval.

## Compatibility

No localStorage key or local record is rewritten. Sign-in and migration do not upload, claim, deduplicate, or delete local rounds. Existing Shared Match records remain in place. The database-level scoring capability remains transitional and match-scoped; finer team/player capability enforcement is deferred until scoring assignments are stored as authoritative database records.

## Automated verification

- Focused security/compatibility suite: 26/26 passed.
- Full application suite: 350/350 passed.
- Disposable local SQL suite: legacy Identity/RoundRecord tests passed; v30.3.93 passed 21 actor-level RLS assertions.
- Migration idempotency: v30.3.93 applied twice successfully.
- Rollback probe: baseline Course, Tee, Hole, Match, and Score rows were preserved; secure migration then reapplied successfully.
- Release validation and diff whitespace checks passed. Repository lint remained at zero errors and 163 pre-existing warnings.
- Standard plus extended simulation: 125 rounds, zero failures and zero live-versus-mirror differences.

## Manual acceptance

- Public Course Catalog reads; anonymous catalog writes denied.
- Allowlisted durable Account can create/update a draft course; unrelated Account denied.
- Host creates a Shared Match; joined anonymous-auth device joins with DYE code.
- Unrelated authenticated session cannot discover or read the match.
- Two-device scores converge, including delayed Hole 3 and final parity.
- Access-code rows are unavailable to browsers.
- Local-only scoring works signed out and offline; existing local records remain unchanged.
