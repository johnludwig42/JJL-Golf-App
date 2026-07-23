# Course Library Security Migration

> **Decision A-001 supersession:** This review package predates the approved authenticated-only cloud Course Library policy. Any anonymous/public Course Library read design described by the package is a legacy proposal and is not approved for deployment. The migration SQL remains unchanged for historical review; an authorized security work package must reconcile it before deployment. Downloaded local course data must remain available offline.

## Scope and baseline

This package prepares, but does not deploy, Course Library RLS. The production baseline supplied for the future deployment is 10 courses, 54 tees, and 972 holes. The migration aborts on a different baseline or invalid relationships. Counts are a one-time deployment gate, not a permanent invariant.

Legacy courses retain their IDs and become ownerless `approved`/`legacy` rows. Tee and hole rows are not rewritten. Local copies and immutable Round Course Snapshots are outside the SQL tables and remain untouched.

## Files

- Forward: `supabase/migrations/202607160001_v30_3_75a_course_library_security.sql`
- Rollback: `supabase/rollbacks/202607160001_v30_3_75a_course_library_security_rollback.sql`
- Fixture: `supabase/tests/course_library_fixture.sql`
- Policy suite: `supabase/tests/course_library_rls_test.sql`
- Rollback probe: `supabase/tests/course_library_rollback_test.sql`
- Runner: `scripts/test-course-library-rls.ps1`

## Required deployment gate

1. Export all three production tables, schema, policies, functions, and grants.
2. Record ordered ID manifests and verify 10/54/972 plus foreign-key consistency.
3. Restore the export into an isolated staging project.
4. Run the forward migration in staging.
5. Run the SQL policy suite with real Supabase JWT integration tests added in v30.3.75B.
6. Verify the existing app can read approved rows and keeps local saves after denied writes.
7. Review Security Advisor findings and query `pg_policies` for unexpected policies.
8. Approve rollback and maintenance window.
9. Only v30.3.75E may authorize production execution.

## Recommended real-test environment

The primary recommendation for v30.3.75A is a standalone disposable PostgreSQL database. The checked-in fixture deliberately emulates Supabase `auth.uid()`, `auth.jwt()`, `anon`, and `authenticated`, making this the smallest environment that runs the complete harness without modifying Supabase-managed Auth tables. It accurately tests PostgreSQL grants, RLS, security-definer behavior, transaction rollback, and claim-dependent policy logic. Its limitation is that it does not issue real Supabase JWTs or reproduce the hosted gateway; those integration tests belong to v30.3.75B.

The fallback is Local Supabase with Docker Desktop and Supabase CLI. It has greater platform fidelity but the current standalone fixture must not be run unchanged because Local Supabase already owns `auth.users`, `auth.uid()`, roles, and grants. For that reason, standalone PostgreSQL is the executable v30.3.75A path; Local Supabase is the v30.3.75B issued-JWT integration path.

### Primary: standalone PostgreSQL on Windows

1. Install PostgreSQL 15 or later from the official Windows installer, including Command Line Tools.
2. Open a new PowerShell window and verify `psql --version`.
3. Create an empty disposable database. Do not reuse any application database:

```powershell
createdb -h localhost -U postgres dye_ledger_rls_disposable
```

4. Put the connection URI in the current process only. This avoids committing it or placing it directly in the command invocation:

```powershell
$env:SUPABASE_TEST_DATABASE_URL = 'postgresql://postgres:YOUR_LOCAL_PASSWORD@localhost:5432/dye_ledger_rls_disposable'
.\scripts\test-course-library-rls.ps1 -ValidateTargetOnly
.\scripts\test-course-library-rls.ps1
```

5. Confirm the printed host/database is the disposable database and type `DISPOSABLE`. The runner executes fixture, migration, policy suite, Stage 1 rollback, rollback probe, forward reapply, and policy suite again. `ON_ERROR_STOP=1` makes the first SQL failure terminate the run with a nonzero exit.
6. Save the full terminal transcript. It must show no SQL error and the final success message.
7. Remove credentials from the process and delete the database:

```powershell
Remove-Item Env:SUPABASE_TEST_DATABASE_URL
dropdb -h localhost -U postgres dye_ledger_rls_disposable
```

PostgreSQL is free; only local disk and installation time are required.

### Fallback: Local Supabase for v30.3.75B JWT integration

1. Install and start Docker Desktop.
2. Install Supabase CLI and verify `supabase --version` and `docker version`.
3. In a separate disposable directory—not this production worktree—run:

```powershell
New-Item -ItemType Directory C:\Temp\dye-ledger-supabase-test
Set-Location C:\Temp\dye-ledger-supabase-test
supabase init
supabase start
```

4. Create the three Course Library fixture tables through a Local-Supabase-specific fixture that preserves its managed `auth` schema. Create temporary Auth users through the local Auth API and test with issued access tokens. Do **not** run `course_library_fixture.sql` unchanged in Local Supabase.
5. Apply the reviewed migration and run SQL assertions through the local database URL printed by `supabase status`.
6. Capture CLI output and API actor results, then clean up:

```powershell
supabase stop --no-backup
Set-Location C:\
Remove-Item -LiteralPath C:\Temp\dye-ledger-supabase-test -Recurse -Force
```

Local Supabase is free but requires Docker resources and a separate issued-JWT harness. A disposable hosted Supabase project offers highest hosted fidelity and may incur account/project limits; it should be used in v30.3.75B after the Auth-aware fixture exists, never with production credentials or data.

## Runner safety

The runner requires an explicit URI, prints only scheme/host/port/database, never prints credentials, and requires the exact `DISPOSABLE` confirmation. It accepts local hosts by default; a verified remote disposable database additionally requires `-AllowRemoteDisposable`. It rejects the known production reference `ueallqqmdyzwdlmoyxfo` with no override. Use the environment variable so credentials do not appear in command history. `-SkipRollbackTest` is deliberate opt-out; the default includes rollback and reapply. `-ValidateTargetOnly` performs target safety validation without calling `psql`.

## Disposable test execution

Install PostgreSQL `psql`, create an empty disposable database, and set:

```powershell
$env:SUPABASE_TEST_DATABASE_URL = 'postgresql://...disposable-database...'
.\scripts\test-course-library-rls.ps1
```

The fixture populates a new database and must never target production or an existing Supabase-managed Auth schema. The plain-SQL test sets both database roles and `request.jwt.claim.sub`/`request.jwt.claims`, including `is_anonymous`; `SET ROLE` alone is not treated as Auth simulation. v30.3.75B must additionally test issued Supabase Auth JWTs.

## Rollback

Stage 1 drops Course Library policies, disables RLS, and restores browser-role CRUD grants, preserving all rows and security columns. It restores pre-migration availability but also restores the known public exposure, so it is incident-only and not a secure steady state.

Stage 2 is commented and manual. It may remove authorization metadata only after backup and proof no drafts exist. It must not be used automatically and never drops Course Library tables or rows.

The rollback probe verifies RLS is disabled, baseline rows and relationships remain, and pre-migration anonymous write availability is restored inside a rolled-back test transaction. The runner then reapplies the migration. Reapply is supported only while the exact baseline remains; if real drafts exist, the deliberate 10/54/972 preflight blocks reapply and requires a separately reviewed recovery migration.

Production Supabase remains untouched. Its Security Advisor/RLS finding remains unresolved until the v30.3.75E production gate.

## Application reconciliation

`loadSupabaseCourses` selects all three tables without Anonymous Auth and merges visible rows locally. Sync inserts/updates a course before its tees and holes. Existing child rows are updated by ID/hole number; they are not generally replaced. Delete explicitly removes holes, then tees, then the course even though foreign keys cascade. IDs are client-generated text values.

Local saves occur before cloud sync. Failures set `cloudSyncState` to `pending-sync`, preserve local data, report status, and can be retried. Under future RLS, login-free writes will therefore fail safely, but v30.3.75B must bind cloud draft sync to a permanent session, avoid canonical deletion controls, and distinguish canonical rows from owned drafts.
