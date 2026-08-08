# Constitutional Review — v30.3.92 Beta Account Activation

## Scope

This release activates the repository foundations for six-digit email Account authentication and explicit first-time creation of the authenticated person’s permanent claimed Golfer Identity. It does not upload or link historical local players or Rounds, change Shared Match identity, or make authentication mandatory for local scoring.

## Principles implemented or affected

- **Principle 1 — Ownership:** Account authentication is separated from Device-local records. Signing in creates no implied ownership over existing local players or Rounds.
- **Principle 3 — Canonical Golfer Identity:** A verified durable Account may explicitly create one permanent claimed Golfer Identity. Email proves Account access but is not the identity key.
- **Principle 4 — Personal Golfer Library:** Creating the caller’s identity atomically creates the caller-owned library relationship.
- **Principle 16 — Enduring Golfer Identity:** Full name and optional nickname are mutable profile attributes. The implementation never searches, matches, deduplicates, or merges by name, nickname, email, phone, or GHIN.
- **Principle 18 — Identity, Membership, Attendance & Participation:** Account and Golfer Identity activation does not create Round Participation or scoring authority.
- **Principle 23 — Privacy, Deletion & Historical Preservation:** Existing Device-local records remain untouched. The rollback removes only the onboarding function and deliberately preserves identities already created.

## Compliance findings

- Authentication remains optional for local-only scoring and joined Shared Match Devices.
- The Account client retains a storage namespace separate from legacy anonymous Shared Match authentication.
- First-time identity creation requires an explicit confirmation and a durable non-anonymous Account.
- The server operation is transactional, idempotent per Account, callable only by `authenticated`, and derives ownership solely from `auth.uid()`.
- No automatic local scan, upload, claiming, rewriting, deduplication, deletion, or attribute-based merge path was added.
- No scoring, settlement, Shared Match, RoundRecord, or legacy reopen logic was changed.

## Deployment boundary

The application’s exact-project Account gate remains disabled in the tracked production-associated configuration. Migration `202608060001_v30_3_92_beta_account_activation.sql` was created but not applied. Enabling Account authentication or applying the migration to any production project requires separate Product Owner approval after live-schema inventory, SMTP/template/redirect review, and non-production acceptance.

## Constitutional conclusion

No constitutional conflict was identified. The release implements the approved Account and canonical Golfer Identity separation while preserving local-first operation and historical boundaries.
