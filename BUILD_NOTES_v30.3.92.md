# The Dye Ledger v30.3.92 — Beta Account Activation

## Implemented

- Preserved the existing six-digit email OTP flow, durable session restoration, resend throttling, offline guidance, and local sign-out.
- Added explicit first-time onboarding for the signed-in person’s own permanent claimed Golfer Identity using full name and optional nickname.
- Added clear confirmation that mutable attributes are not identity keys and that local players and Rounds are not connected or uploaded.
- Added a transactional, idempotent Supabase RPC that derives the Account from `auth.uid()`, rejects anonymous users, creates at most one claimed Golfer Identity per Account, and creates the Personal Golfer Library relationship.
- Added a rollback that removes only the RPC and preserves Account, Golfer Identity, and library data.
- Added deterministic coverage for account-scoped reads, explicit confirmation, no merge attributes, offline failure, least privilege, idempotency, and local-first UX language.

## Compatibility and security

- The `the-dye-ledger-v20` application state key is unchanged.
- No localStorage, IndexedDB, player, Round, template, preference, Memory, course, Shared Match, scoring, or settlement migration was added.
- Sign-in and identity creation do not scan, upload, claim, merge, rewrite, deduplicate, or delete existing local data.
- Shared Match remains sign-in optional and its anonymous auth session remains separate from the durable Account session.
- The exact-project Account gate remains fail-closed in the tracked production-associated configuration.

## Database and deployment status

- Added migration: `supabase/migrations/202608060001_v30_3_92_beta_account_activation.sql`.
- Added rollback: `supabase/rollbacks/202608060001_v30_3_92_beta_account_activation_rollback.sql`.
- No migration was applied to production or any remote database during implementation.
- Production activation still requires explicit project selection, live-schema inventory, migration approval, SMTP and branded six-digit template validation, allowed redirect configuration, rate-limit/abuse review, and delivery testing.

## Automated verification

- Focused Account/Identity/Shared Match suite: 26/26 passed.
- Release pretest gate: 53/53 passed.
- Full application test suite: 349/349 passed.
- Release validation: passed.
- Release sanity with explicit v30.3.92 target: 8 passed, 1 expected dirty-worktree warning, 0 failures.
- Standard simulation: 75 rounds, 0 failures, 75 exact live-versus-mirror comparisons.
- Extended simulation: 2,525 rounds, 0 failures, 2,525 exact live-versus-mirror comparisons.
- Syntax checks: passed for `app.js`, `identity-security.js`, and `service-worker.js`.
- Lint: 0 errors and 163 pre-existing warnings; no new lint error was introduced.
- SQL/RLS integration: passed against a dedicated disposable localhost database. Ordered migrations were applied twice and all 49 Course Library, Account, identity, Round role, immutable history, audit, anonymous-denial, and actor assertions passed. The guarded runner refuses remote targets and now fails on indented pgTAP `not ok` output.
- Secret scan: no credential, service-role key, database URL, OTP, token, or private key added.

## Deferred

- Linking or claiming historical local golfers and Rounds.
- Automatic cloud upload or cloud-authoritative Round persistence.
- Phone, SMS, social providers, GHIN verification, provider-linking UI, privacy/deletion UI, and complete claim conflict workflows.
- Mandatory authentication for local scoring or joined Shared Match participants.

## Manual acceptance required before activation

Completed against disposable localhost Supabase:

- Six-digit email delivery and verification, first-time full-name/nickname onboarding, session restoration, local sign-out, repeat sign-in without duplicate onboarding, destination-email retention, Change Email, and resend countdown/action.
- Existing local Match and Shared Match code remained present through sign-in, reload, sign-out, and repeat sign-in; no automatic local record claim or upload occurred.
- Ordered SQL migrations were applied twice to a dedicated disposable database and all 49 RLS/actor assertions passed.

Still required before production activation:

1. Verify invalid and expired code presentation manually; deterministic automated coverage already passes.
2. Verify temporary offline local scoring before, during, and after an Account session.
3. Verify installed iPhone PWA upgrade/data retention.
4. Verify Shared Match host/join/scoring convergence remains sign-in optional on two Devices.
5. Inventory and approve the exact production project, SMTP/template, redirects, rate limits, abuse controls, migration application, and Account gate separately.
6. Confirm production Supabase remains untouched until that separate approval.
