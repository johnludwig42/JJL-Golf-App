# STAGING ONLY. Review AUTO_RLS_REVIEW.md before execution.
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
$stagingSql = Join-Path $PSScriptRoot 'install-auto-rls-review.sql'
if (!(Test-Path -LiteralPath $stagingPsql) -or !(Test-Path -LiteralPath $stagingSql)) {
    throw 'Required psql or reviewed installer file is missing.'
}
# The pooler username selects the project; no source/production username is reused.
& $stagingPsql -X --host $stagingHost --port 5432 --username "postgres.$stagingReference" --dbname 'dbname=postgres sslmode=require connect_timeout=15' --password --set ON_ERROR_STOP=1 --command "SELECT set_config('dye.staging_settings_authorized', '$stagingReference', false);" --file $stagingSql
if ($LASTEXITCODE -ne 0) {
    throw 'Staging automatic-RLS alignment failed. Retain the error and audit settings before retrying.'
}
Write-Host 'Staging automatic-RLS alignment committed. Export provider-settings-read-only.sql from staging again. RPC upgrade has NOT been installed.'
