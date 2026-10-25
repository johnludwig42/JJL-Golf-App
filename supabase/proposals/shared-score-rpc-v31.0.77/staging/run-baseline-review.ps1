# STAGING ONLY. Review BASELINE_PACKAGE.md before execution.
# No keys/passwords are stored. psql prompts for the staging database password.
$ErrorActionPreference = 'Stop'
$stagingReference = 'darbakmabpbkikisadop'
$stagingHost = Read-Host 'STAGING Session pooler host (from staging Connect panel)'
if ($stagingHost -notmatch '^aws-[a-z0-9-]+\.pooler\.supabase\.com$') {
    throw 'Expected a Supabase Session pooler hostname without a URL, port or password.'
}
$confirmedReference = Read-Host 'Confirm STAGING project reference'
if ($confirmedReference -cne $stagingReference) {
    throw 'Wrong target. This installer is restricted to darbakmabpbkikisadop.'
}
$stagingPsql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$stagingSql = Join-Path $PSScriptRoot 'install-baseline-review.sql'
if (!(Test-Path -LiteralPath $stagingPsql) -or !(Test-Path -LiteralPath $stagingSql)) {
    throw 'Required psql or reviewed installer file is missing.'
}
# The pooler username selects the project; no source/production username is reused.
& $stagingPsql -X --host $stagingHost --port 5432 --username "postgres.$stagingReference" --dbname 'dbname=postgres sslmode=require connect_timeout=15' --password --set ON_ERROR_STOP=1 --command "SELECT set_config('dye.staging_baseline_authorized', '$stagingReference', false);" --file $stagingSql
if ($LASTEXITCODE -ne 0) {
    throw 'Staging baseline failed. Transaction was not accepted; retain the error and re-audit before retrying.'
}
Write-Host 'Staging baseline committed. Run the read-only catalog audit next. RPC upgrade has NOT been installed.'
