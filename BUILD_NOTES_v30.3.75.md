# The Dye Ledger v30.3.75 — Identity & Security Foundation

Adds constitutional identity contracts, email OTP Account & Security UI, immutable cloud RoundRecord/amendment foundations, ordered unapplied migrations, least-privilege target RLS, security/deployment guidance, and deterministic tests.

Security remediation isolates durable Account auth from legacy anonymous Shared Match sessions, disables Account auth unless an exact environment/project gate is approved, provisions only durable Accounts, enforces one authoritative Round Owner and same-Round relationships, publishes versions atomically, preserves append-only audit history, and adds actor-based RLS and production-refusal test tooling.

Compatibility is additive: the `the-dye-ledger-v20` state key and local records remain unchanged. Auth performs no upload, claim, merge, rewrite, deduplication, or deletion. Joined Shared Match golfers need not authenticate. Scoring and settlement logic are unchanged.

Deferred: complete Amendment Session UI, historical claiming/import, phone/social providers, privacy/claim UI, cloud migration, Shared Match policy redesign, and authorized-only catalog-read cutover.

## Verification

- Full application suite: 231/231 passed.
- Focused Identity & Security suite: 12/12 passed.
- Release validation: passed.
- Release sanity: 6 passed, 3 expected working-tree/build-target warnings, 0 failures.
- Standard simulation: 100 rounds, 0 failures, 100 exact live-versus-mirror comparisons.
- Extended simulation: 150 rounds, 0 failures, 150 exact live-versus-mirror comparisons.
- Disposable local PostgreSQL/Supabase integration: passed.
- Course Library least-privilege actor suite: passed.
- Identity migrations 001-003 applied twice successfully as the idempotency gate.
- Identity/RLS actor assertions: 40/40 passed, covering durable versus anonymous Accounts, Owner/Participant/Viewer/unrelated/anonymous access, immutable versions and audit, stale publication, same-Round foreign keys, Personal Golfer Library isolation, and protected catalog writes.
- Repository-wide lint remains at the pre-existing baseline of 9 errors and 163 warnings; the new Identity module passes its focused checks.

## Manual acceptance

Completed on a localhost-only disposable Supabase stack:

- Six-digit email OTP delivery through local Mailpit.
- OTP verification, signed-in state, session restoration, and sign-out.
- Local course creation and local-only scoring remained available.
- Sign-in and sign-out did not upload, claim, merge, rewrite, deduplicate, or delete local records.
- The tracked production-associated Account Auth configuration remained disabled.

Pending before merge or deployment:

- Installed iPhone PWA upgrade and data-retention acceptance.
- Temporary offline scoring on the installed iPhone PWA.
- Two-device Shared Match convergence and exactly-once settlement acceptance.

## Local database safety

`supabase/config.toml` is a local-development configuration. Automatic repository migrations and seed execution are disabled so startup provides a blank localhost test host; the guarded `scripts/test-identity-security-rls.ps1` runner owns the reviewed fixture/migration sequence. It refuses remote database hosts, the known production project reference, and execution without explicit local-test approval. The local OTP template displays `{{ .Token }}` and contains no provider secret.

No migration was applied to production. Production Supabase, live RLS, production data, secrets, deployment, main, and remote branches were not changed.
