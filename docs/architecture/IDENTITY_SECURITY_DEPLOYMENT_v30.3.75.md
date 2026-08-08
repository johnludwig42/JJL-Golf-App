# Identity & Security Deployment, Rollback, and Live Inventory

No migration self-applies. Production application requires separate Product Owner approval.

## Live-schema inventory

1. Record the selected project/environment without copying keys and confirm it is not production before validation.
2. Inventory extensions, tables, columns, constraints, indexes, triggers, grants, RLS/policies, Auth settings, Functions, Realtime, storage, migration history, and row counts. Redact URLs, tokens, subjects, emails, phones, OTPs, and service-role material.
3. Compare the live definitions with `supabase-schema.sql` and ordered migrations; resolve drift first.
4. Confirm backup/PITR and rehearse rollback in a disposable test database.

## Stages

1. Use only a disposable local Supabase/PostgreSQL instance. Set `DYE_LEDGER_TEST_DB_APPROVED=YES` and `DYE_LEDGER_TEST_PROJECT_REF=LOCAL`, then pass `-ConfirmTestDatabase`. The automated runner refuses every remote database and the known production project. Run migrations 001–003 twice; run pgTAP allow/deny cases for Owner, Participant, Viewer, unrelated authenticated user, and anon.
2. Test branded SMTP templates, six-digit tokens, expiry, resend/rate limits, CAPTCHA/abuse controls, redirect allowlist, iPhone PWA return, restore/sign-out, bounces, and delivery without logging private content.
3. Test installed-PWA upgrade/data retention and offline scoring. Confirm sign-in produces no application cloud writes.
4. Separately approve staging, then production; take fresh inventory/backup and monitor denials. Never weaken RLS to cure app errors.

## Rollback

Stop new writes, preserve identity/history tables, revoke new grants, and use the data-preserving rollback under `supabase/rollbacks`. Do not restore anonymous catalog mutation or delete RoundRecord versions. Prefer a forward fix after records exist.

Phone, SMS, social login, and external provider configuration are out of scope.

## v30.3.92 activation addendum

The tracked application configuration references the existing application Supabase project while Account authentication remains disabled. A different project was previously used for disposable identity testing. Do not infer that either remote project contains the v30.3.75 identity schema: inventory the explicitly selected target before changing the gate.

Before enabling v30.3.92 Account authentication:

1. Obtain separate Product Owner approval naming the exact environment and project reference.
2. Inventory the target without printing its URL credentials, JWTs, publishable/secret keys, OTPs, or user data.
3. In a disposable local or explicitly approved non-production environment, apply migrations `202607220001` through `202607220003`, then `202608060001`, twice; run the identity actor tests and onboarding tests.
4. Verify Auth email uses a branded template that renders `{{ .Token }}` as a six-digit code, not only a magic link. Validate expiry, resend throttling, provider rate limits, CAPTCHA/abuse readiness, delivery/bounces, and the exact redirect allowlist.
5. Verify Account session storage remains separate from anonymous Shared Match auth and that sign-out affects only the durable Account client.
6. Verify first-time identity creation, repeat submission, reload, offline failure, and RLS denial for anonymous or unrelated actors.
7. Re-run installed iPhone PWA data-retention and two-Device Shared Match acceptance before production activation.

Migration `202608060001` is data-preserving and creates no automatic matching path. Its rollback removes only the RPC. After any identity exists, do not delete Account, Golfer Identity, or Personal Golfer Library rows as an application rollback.
