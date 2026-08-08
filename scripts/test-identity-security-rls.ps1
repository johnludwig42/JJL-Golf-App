param(
  [string]$DatabaseUrl = $env:SUPABASE_DB_URL,
  [string]$ExpectedProjectRef = $env:DYE_LEDGER_TEST_PROJECT_REF,
  [switch]$ConfirmTestDatabase,
  [switch]$ValidateTargetOnly
)
$ErrorActionPreference = 'Stop'
$ProductionProjectRef = 'ueallqqmdyzwdlmoyxfo'
if (-not $ConfirmTestDatabase -or $env:DYE_LEDGER_TEST_DB_APPROVED -cne 'YES') { throw 'Refusing database tests. Pass -ConfirmTestDatabase and set DYE_LEDGER_TEST_DB_APPROVED=YES.' }
if (-not $DatabaseUrl) { throw 'SUPABASE_DB_URL is required and will not be printed.' }
try { $target = [Uri]$DatabaseUrl } catch { throw 'SUPABASE_DB_URL must be a valid PostgreSQL URI.' }
if ($target.Scheme -notin @('postgres','postgresql')) { throw 'SUPABASE_DB_URL must use postgres:// or postgresql://.' }
if ($DatabaseUrl -match [regex]::Escape($ProductionProjectRef)) { throw 'REFUSED: the configured production project is never a valid test target.' }
if ($target.Host -notin @('localhost','127.0.0.1','::1')) { throw 'Remote databases are refused. Run this suite only against a disposable local Supabase/PostgreSQL instance.' }
if ($ExpectedProjectRef -cne 'LOCAL') { throw 'Local tests require DYE_LEDGER_TEST_PROJECT_REF=LOCAL.' }
if ($ValidateTargetOnly) { Write-Host 'Target identity validation passed; no database command was executed.'; exit 0 }
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) { throw 'psql is required and was not found on PATH.' }
$root = Split-Path -Parent $PSScriptRoot
function Invoke-SqlFile([string]$RelativePath) {
  $file = Join-Path $root $RelativePath
  Write-Host "Running $RelativePath"
  $priorErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = & psql $DatabaseUrl -X -v ON_ERROR_STOP=1 -f $file 2>&1
  $psqlExitCode = $LASTEXITCODE
  $ErrorActionPreference = $priorErrorActionPreference
  $output | ForEach-Object { Write-Host $_ }
  if ($psqlExitCode -ne 0) { throw "psql failed while running $RelativePath" }
  if (($output -join "`n") -match '(?m)^\s*not ok\b') { throw "pgTAP assertions failed while running $RelativePath" }
}
# Exercise the Identity package on top of the real v30.3.75a Course Library
# baseline instead of a simplified stand-in.
Invoke-SqlFile 'supabase/tests/course_library_fixture.sql'
Invoke-SqlFile 'supabase/migrations/202607160001_v30_3_75a_course_library_security.sql'
Invoke-SqlFile 'supabase/tests/course_library_rls_test.sql'
Invoke-SqlFile 'supabase/tests/v30_3_75_identity_fixture.sql'
Invoke-SqlFile 'supabase/migrations/202607220001_v30_3_75_identity_foundation.sql'
Invoke-SqlFile 'supabase/migrations/202607220002_v30_3_75_round_record_security.sql'
Invoke-SqlFile 'supabase/migrations/202607220003_v30_3_75_catalog_and_shared_target.sql'
Invoke-SqlFile 'supabase/migrations/202608060001_v30_3_92_beta_account_activation.sql'
# A second application is the idempotency gate.
Invoke-SqlFile 'supabase/migrations/202607220001_v30_3_75_identity_foundation.sql'
Invoke-SqlFile 'supabase/migrations/202607220002_v30_3_75_round_record_security.sql'
Invoke-SqlFile 'supabase/migrations/202607220003_v30_3_75_catalog_and_shared_target.sql'
Invoke-SqlFile 'supabase/migrations/202608060001_v30_3_92_beta_account_activation.sql'
Invoke-SqlFile 'supabase/tests/v30_3_75_identity_rls_test.sql'
Invoke-SqlFile 'supabase/tests/v30_3_92_beta_account_activation_test.sql'
Invoke-SqlFile 'supabase/tests/v30_3_93_security_fixture.sql'
Invoke-SqlFile 'supabase/migrations/202608070001_v30_3_93_production_security_activation.sql'
Invoke-SqlFile 'supabase/tests/v30_3_93_security_rls_test.sql'
# A second application proves the new migration is idempotent.
Invoke-SqlFile 'supabase/migrations/202608070001_v30_3_93_production_security_activation.sql'
Invoke-SqlFile 'supabase/rollbacks/202608070001_v30_3_93_production_security_activation_rollback.sql'
Invoke-SqlFile 'supabase/tests/v30_3_93_rollback_probe.sql'
# Leave the disposable target in the secure state after validating rollback.
Invoke-SqlFile 'supabase/migrations/202608070001_v30_3_93_production_security_activation.sql'
Write-Host 'Identity and security migration/RLS test sequence completed successfully through v30.3.93.'
