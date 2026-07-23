# The Dye Ledger v30.3.75 — Identity & Security Decisions

## Status

Approved Product Owner decisions governing v30.3.75.

Constitution Version: 1.0
Approval Status: Approved
Product Owner: John Ludwig
Approval Date: July 21, 2026

These decisions are subordinate to [The Dye Ledger Constitution v1.0](THE_DYE_LEDGER_CONSTITUTION_v1.0.md).

## Decision A-000 — Product Identity Requirement

The Dye Ledger will use formal, durable user authentication for:

- beta access;
- commercial entitlements and monetization;
- user-level analytics;
- account continuity;
- account recovery;
- cross-device services.

Authentication must be low-friction and persistent so users are not repeatedly required to log in.

Anonymous identities may be used only for explicitly defined transitional or guest workflows.

Classification:

- constitutional confirmation of Principle 3;
- binding release-level policy;
- not a new constitutional principle.

### Constitutional Review

- Implements Principle 3 — Canonical Golfer Identity.
- Supports Principles 1, 4, 6, 16, 18, and 23.
- Does not create a new constitutional principle.
- Supersedes legacy assumptions that the final product will operate without durable user authentication.
- Does not by itself select the authentication provider or sign-in method.

## Decision A-001 — Cloud Course Library Access

The cloud-hosted canonical Course Library will be available only to authenticated, authorized users.

Approved canonical courses, tees, and holes may be read by authenticated users through RLS.

Unauthenticated public access must be denied.

Previously downloaded course data remains available locally under the offline-first architecture.

Classification:

- binding release-level architecture and security policy;
- not a constitutional amendment;
- supersedes repository documentation or migrations that permit anonymous Course Library reads.

### Constitutional Review

- Implements Principles 1, 3, 4, and 6.
- Does not create a new constitutional principle.
- Supersedes anonymous or public cloud Course Library read assumptions.
- Preserves offline access to previously downloaded course data.
- Does not yet determine canonical Course Library contribution, approval, correction, retirement, or maintainer authority.

## Decisions Already Settled — Do Not Reopen

- Primary users require authenticated accounts.
- Authentication must be low-friction and persistent.
- Golfer Identity is distinct from email, phone, device, and Round participation.
- Anonymous identity is exceptional rather than the primary identity model.
- Cloud canonical Course Library access requires authentication and authorization.
- Downloaded Course Library data remains available offline.
- Devices remain working copies.
- Completed RoundRecords are never silently overwritten.
- Privacy, access removal, anonymization, archival, withdrawal, and deletion remain distinct.

## Decisions Still Required

- B-001 — Initial durable sign-in method.
- B-002 — Guest and anonymous workflow boundaries.
- B-003 — Existing anonymous identity transition.
- A-002 — Canonical Course Library contribution and maintainer authority.
- C-001 — Beta allowlist administration.
- C-002 — Analytics privacy and retention.
- D-001 — Shared Match membership, joining, and revocation.
- D-002 — Database permissions by Round role.

These are implementation and policy decisions subordinate to the Constitution. They remain unresolved and are not decided by this document.
