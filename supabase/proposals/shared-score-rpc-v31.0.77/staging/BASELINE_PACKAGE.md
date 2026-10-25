# Staging baseline installation package — October 25, 2026

Post-install update: query (16) confirms the corrected staging baseline matches
all audited application objects, bodies, grants, constraints and policies. No
installer retry is needed. Do not rerun it. Next capture the read-only provider
settings in both projects before the RPC rehearsal; real service tests are pending.

## Correction after the first staging attempt

The first user-run staging attempt failed before COMMIT because three GRANT
statements still referenced the omitted provider `rls_auto_enable()` function.
The original local fixture contained that function, hiding this missing-object
dependency and testing its body/comment preservation without checking its grants.
Those three GRANT statements are now removed. No provider helper definition or
permissions are changed or required by the corrected installer.

The original failure was reproduced locally with the function absent; connection
closure rolled back all application DDL (zero public application tables). The
corrected installer then committed and passed assertions in both absent-helper
and existing-helper fixtures, including unchanged provider grants when present.
Both catalogs match all 17 application tables/ACLs, 169 columns, 31 indexes and
28 policies. The updated installer SHA-256 and evidence are recorded in the review
JSON. No cleanup/drop is needed: rerunning the wrapper first checks for an empty
application baseline and refuses existing application objects rather than
overwriting them. Actual staging post-install audit remains required.

## Review outcome

The supplied `production-public-schema.sql` is a complete schema-only pg_dump
export from PostgreSQL 17.6, produced by pg_dump 18.4. It contains no COPY/table
data sections. Application inventory and all 12 normalized function bodies match
the October 20 production catalog. Source SHA-256 and detailed local comparisons
are retained in `docs/audits/v31.0.80-baseline-export-review.json`.

**Prepared for staging baseline execution only.** Not executed on Supabase.
Production deployment and the separate RPC upgrade remain unapproved/unperformed.

## What the package changes

`install-baseline-review.sql` creates the existing application baseline:
17 tables, 169 columns, 58 application constraints, 31 indexes, 28 policies,
12 functions, one sequence and the two application triggers. The Auth provisioning
trigger omitted by the public-schema dump is restored separately from the captured
production definition. No production records or passwords are included.

The package preserves existing public schema ownership/permissions, provider
default privileges and the provider `rls_auto_enable` helper. The dump's CREATE
SCHEMA public, provider helper definition, schema ACL and all six default-ACL
sections are explicitly excluded. There are no DROP/reset commands and no
historical migration replay. The RPC/receipt/revision and RoundRecord foundations
remain absent, matching the deployed starting point.

Before replaying source object grants, the installer clears inherited grants for
PUBLIC/anon/authenticated/service_role on **only the newly created application
objects**. This prevents a fresh project's broad defaults from granting additional
browser permissions. It preserves production's known broad authenticated identity
table grants and member-level direct score policy; that reproduces the baseline,
not a claim that those previously reported findings have been fixed.

All DDL and verification share one transaction with five-second lock and
60-second per-statement timeouts. Missing authorization, existing application
objects or unexpected final counts abort. Connection closure after an error rolls
back the uncommitted transaction. Successful installation is not a resettable
fixture; do not drop it to rerun. If any data is later added, preserve it.

## Target and execution

The PowerShell wrapper pins the pooler login to **postgres.darbakmabpbkikisadop**,
requires the same project reference as confirmation, and accepts only a Supabase
pooler hostname. It does not reuse production connection variables, accept a
different username/SQL path, store credentials or edit app configuration. It uses
TLS and a connection timeout. Enter the **staging** database password at its prompt.

The SQL session setting is an operator confirmation, not independent server-side
project detection. Use the wrapper rather than pasting the installer into an
arbitrary SQL Editor. Confirm host details in staging's Connect panel first.

From PowerShell:

```powershell
& 'C:\Projects\JJL-Golf-App\supabase\proposals\shared-score-rpc-v31.0.77\staging\run-baseline-review.ps1'
```

The wrapper asks for staging Session pooler host and this confirmation:

```text
darbakmabpbkikisadop
```

After a successful commit, run `scripts/check-shared-delivery-production.sql` in
**staging** and export the new CSV for comparison. Do not run the original dump,
historical migrations or the RPC installer. If execution fails, retain the error
and audit current objects before retrying; do not alter guards or delete objects.

## Local verification and remaining gates

Rehearsal used a new disposable localhost PostgreSQL 18.4 database with synthetic
Auth prerequisites, deliberately broad inherited grants and a pre-existing provider
helper. This is SQL/privilege evidence, not actual Supabase Auth/Realtime evidence.

- Unauthorized execution refused before application DDL.
- Authorized install committed; second execution refused existing application state.
- Catalog comparison: **17/17 tables, 169/169 columns, 58/58 constraints,
  31/31 indexes and 28/28 policies**, zero differences against the captured baseline.
  PostgreSQL 18's additional NOT NULL catalog entries are excluded from the 58
  baseline-constraint comparison; column nullability itself matches exactly.
- All 17 tables' RLS flags, ownership and complete table ACLs matched.
- All 12 functions' normalized bodies, signatures, return types, security/search-path
  settings, ownership and grants matched.
- Broad inherited browser grants were removed; expected catalog read and match
  edit grants remained. Existing provider helper was untouched.
- Application account-provisioning trigger passed a rolled-back synthetic insert.
- Staging PowerShell wrapper parsed successfully; it was not executed against Supabase.
- Local server stopped. No production/staging database changes occurred.

Provider-owned schema/default privileges/event-trigger state is deliberately not
replayed. Capture `provider-settings-read-only.sql` on production and staging and
review differences **before the RPC upgrade**; the earlier narrow audit did not
inventory the provider helper or default ACLs. A fresh full production catalog
also remains required for the rollout comparison. Database-version differences
(production 17.6 versus local 18.4) still need the actual staging rehearsal.

Client v31.0.80 is unchanged. Its previous full-suite result remains historical
1,533/1,533, not a new real-service result. Real Auth/RLS requests, direct delivery,
RPC/Realtime, closure races, rollback/restore and physical two-phone acceptance
remain NOT_RUN. No financial, score or frozen-record semantics were modified.

Constitutional review: copies application structure for isolated verification;
preserves provider ownership, production facts and authority semantics. Adds no
amendment flow or historical-record change. Production execution remains separate.
