param(
  [string]$DatabaseUrl = $env:SUPABASE_TEST_DATABASE_URL,
  [switch]$SkipRollbackTest,
  [switch]$AllowRemoteDisposable,
  [switch]$ValidateTargetOnly
)

$ErrorActionPreference = 'Stop'
$ProductionProjectRef = 'ueallqqmdyzwdlmoyxfo'

if (-not $DatabaseUrl) {
  throw 'Set SUPABASE_TEST_DATABASE_URL for a disposable database, or pass -DatabaseUrl. Never use production.'
}

try { $target = [Uri]$DatabaseUrl } catch { throw 'DatabaseUrl must be a valid PostgreSQL connection URI.' }
if ($target.Scheme -notin @('postgres','postgresql')) { throw 'DatabaseUrl must use postgres:// or postgresql://.' }
if ($DatabaseUrl -match [regex]::Escape($ProductionProjectRef) -or $target.Host -match [regex]::Escape($ProductionProjectRef)) {
  throw "REFUSED: $ProductionProjectRef is the production Dye Ledger project. This runner never targets production."
}
$localHosts = @('localhost','127.0.0.1','::1')
if ($target.Host -notin $localHosts -and -not $AllowRemoteDisposable) {
  throw 'Remote database refused by default. For a verified disposable remote database, rerun with -AllowRemoteDisposable.'
}

$safeTarget = '{0}://{1}:{2}/{3}' -f $target.Scheme,$target.Host,$target.Port,$target.AbsolutePath.TrimStart('/')
Write-Host "Disposable RLS test target: $safeTarget"
Write-Host 'Credentials are intentionally not displayed.'

if ($ValidateTargetOnly) {
  Write-Host 'Target safety validation passed; no database command was executed.'
  exit 0
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  throw 'psql is required and was not found on PATH.'
}

$confirmation = Read-Host 'Type DISPOSABLE to confirm this database may be populated with test data'
if ($confirmation -cne 'DISPOSABLE') { throw 'Confirmation declined.' }

$root = Split-Path -Parent $PSScriptRoot
function Invoke-SqlFile([string]$RelativePath) {
  $file = Join-Path $root $RelativePath
  Write-Host "Running $RelativePath"
  & psql $DatabaseUrl -X -v ON_ERROR_STOP=1 -f $file
  if ($LASTEXITCODE -ne 0) { throw "psql failed while running $RelativePath" }
}

Invoke-SqlFile 'supabase/tests/course_library_fixture.sql'
Invoke-SqlFile 'supabase/migrations/202607160001_v30_3_75a_course_library_security.sql'
Invoke-SqlFile 'supabase/tests/course_library_rls_test.sql'

if (-not $SkipRollbackTest) {
  Invoke-SqlFile 'supabase/rollbacks/202607160001_v30_3_75a_course_library_security_rollback.sql'
  Invoke-SqlFile 'supabase/tests/course_library_rollback_test.sql'
  # The policy test transaction rolls back its temporary drafts, so the exact
  # baseline remains and a forward reapply after Stage 1 is safe to verify.
  Invoke-SqlFile 'supabase/migrations/202607160001_v30_3_75a_course_library_security.sql'
  Invoke-SqlFile 'supabase/tests/course_library_rls_test.sql'
}

Write-Host 'Course Library real-SQL test sequence completed successfully.'
