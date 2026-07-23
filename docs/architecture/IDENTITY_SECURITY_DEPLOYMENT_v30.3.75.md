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
