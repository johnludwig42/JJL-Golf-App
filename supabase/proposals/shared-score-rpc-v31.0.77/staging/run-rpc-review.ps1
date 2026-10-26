# STAGING ONLY. Executes one phase, never the entire rollout automatically.
# The private staging database password is entered only at psql's local prompt.
param(
    [ValidateSet('Install','Rollback','Restore','PublicationFix')][string]$Action = 'Install',
    [string]$SessionPoolerHost = '',
    [string]$ProjectRef = '',
    [switch]$PrepareOnly
)
$ErrorActionPreference = 'Stop'
# Explicit imports also work when launched from development tools with module
# auto-loading disabled; both are standard Windows PowerShell modules.
Import-Module Microsoft.PowerShell.Management -ErrorAction Stop
Import-Module Microsoft.PowerShell.Utility -ErrorAction Stop
$stagingReference = 'darbakmabpbkikisadop'
if (!$SessionPoolerHost) { $SessionPoolerHost = Read-Host 'STAGING Session pooler host (from staging Connect panel)' }
if ($SessionPoolerHost -notmatch '^aws-[a-z0-9-]+\.pooler\.supabase\.com$') {
    throw 'Expected a Supabase Session pooler hostname without URL, port or password.'
}
if (!$ProjectRef) { $ProjectRef = Read-Host 'Confirm STAGING project reference' }
if ($ProjectRef -cne $stagingReference) {
    throw 'Wrong target. This runner is restricted to darbakmabpbkikisadop; production is refused.'
}
$proposalRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = (Resolve-Path (Join-Path $proposalRoot '../../..')).Path
$phase = $Action.ToLowerInvariant()
if ($Action -eq 'PublicationFix') { $phase = 'publication-fix' }
$expectedHashes = @{
    install = 'C47A514901A7A86066C04A98B04445EC7A6ABE33B6835A61225CEC73B569A4DC'
    rollback = '4FAA44BADA2E5629C3EBEB45D2E8D467D20843A59C54419BE6C57CE7E5E4A638'
    restore = '4F2AAA3783F7D8F1D47F2F2BAE00F2F5069ED86F6C86E3E8F82CCA9DD1E363C3'
    'publication-fix' = 'E5759ED8E4E69D55FB18A8B3128317CBE6795535129C04D7D4A465735135B212'
}
$reviewSql = Join-Path $proposalRoot "$phase-review.sql"
if ((Get-FileHash -LiteralPath $reviewSql -Algorithm SHA256).Hash -cne $expectedHashes[$phase]) {
    throw 'Reviewed SQL fingerprint changed. Stop and review rather than executing different SQL.'
}
$stagingPsql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
if (!(Test-Path -LiteralPath $stagingPsql)) { throw 'Required PostgreSQL 18 psql is missing.' }
$runId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$evidenceRoot = Join-Path $workspaceRoot "tmp/report-qa/shared-staging/rpc-$phase-$runId"
New-Item -ItemType Directory -Path $evidenceRoot | Out-Null
function Quote-PsqlPath([string]$Value) {
    if ($Value -match "['\r\n]") { throw 'Unsupported quote or newline in evidence/script path.' }
    return "'" + $Value.Replace('\','/') + "'"
}
$catalogSql = Join-Path $workspaceRoot 'scripts/check-shared-delivery-production.sql'
$preflightSql = Join-Path $PSScriptRoot 'preflight-read-only.sql'
foreach ($requiredSql in @($catalogSql,$preflightSql)) {
    if (!(Test-Path -LiteralPath $requiredSql)) { throw 'Required read-only audit SQL is missing.' }
}
$driverLines = @(
    '\set ON_ERROR_STOP on',
    '\pset format csv',
    "select set_config('dye.staging_rpc_project', '$stagingReference', false);",
    "select set_config('dye.shared_rpc_review_authorized', 'reviewed-$phase', false);",
    ('\o ' + (Quote-PsqlPath (Join-Path $evidenceRoot 'before-schema.csv'))),
    ('\i ' + (Quote-PsqlPath $catalogSql)),
    ('\o ' + (Quote-PsqlPath (Join-Path $evidenceRoot 'before-preflight.csv'))),
    ('\i ' + (Quote-PsqlPath $preflightSql)),
    '\o',
    "do `$stage`$ begin if current_user <> 'postgres' or current_setting('dye.staging_rpc_project',true) is distinct from '$stagingReference' then raise exception 'Staging target/operator guard failed'; end if; end `$stage`$;"
)
# Rollback is safe only against the reviewed installed foundation, not an unknown RPC.
if ($Action -eq 'Rollback') {
    $driverLines += @'
do $state$ begin
 if to_regprocedure('public.submit_shared_score_operations(text,text,jsonb)') is null
 or to_regclass('public.shared_score_operations') is null
 or to_regprocedure('public.protect_completed_shared_scores()') is null
 or to_regprocedure('public.latch_shared_scores_closed()') is null then
  raise exception 'Expected installed reviewed foundation; audit before rollback';
 end if;
end $state$;
'@
}
$driverLines += ('\i ' + (Quote-PsqlPath $reviewSql))
$rpcExpected = if ($Action -eq 'Rollback') { 'false' } else { 'true' }
$driverLines += @"
do `$verified`$ begin
 if (to_regprocedure('public.submit_shared_score_operations(text,text,jsonb)') is not null) <> $rpcExpected
 or to_regclass('public.shared_score_operations') is null
 or (select count(*) from pg_trigger where not tgisinternal and tgenabled='O'
     and ((tgrelid='public.matches'::regclass and tgname='latch_shared_scores_closed_before_write')
       or (tgrelid='public.score_entries'::regclass and tgname='protect_completed_shared_scores_before_write'))) <> 2
 or (select count(*) from information_schema.columns where table_schema='public'
     and table_name='matches' and column_name in ('shared_revision','shared_scores_closed')) <> 2 then
  raise exception 'Post-phase foundation check failed; changes may have committed; audit before retry';
 end if;
end `$verified`$;
"@
$driverLines += @(
    ('\o ' + (Quote-PsqlPath (Join-Path $evidenceRoot 'after-schema.csv'))),
    ('\i ' + (Quote-PsqlPath $catalogSql)),
    ('\o ' + (Quote-PsqlPath (Join-Path $evidenceRoot 'after-preflight.csv'))),
    ('\i ' + (Quote-PsqlPath $preflightSql)),
    '\o'
)
$driverFile = Join-Path $evidenceRoot 'phase.sql'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($driverFile, ($driverLines -join "`r`n"), $utf8)
$manifest = [ordered]@{ projectRef=$stagingReference; action=$Action; sqlSha256=$expectedHashes[$phase]; clientVersion=(Get-Content -LiteralPath (Join-Path $workspaceRoot 'package.json') -Raw | ConvertFrom-Json).version; preparedAt=(Get-Date).ToUniversalTime().ToString('o'); executed=$false }
$manifestFile = Join-Path $evidenceRoot 'run.json'
[System.IO.File]::WriteAllText($manifestFile, ($manifest | ConvertTo-Json), $utf8)
Write-Host "Staging $Action evidence: $evidenceRoot"
if ($PrepareOnly) { Write-Host 'Prepared only. No database connection or SQL execution.'; return }
# The fixed pooler username chooses staging; never accept an arbitrary database user.
& $stagingPsql -X --quiet --host $SessionPoolerHost --port 5432 --username "postgres.$stagingReference" --dbname 'dbname=postgres sslmode=require connect_timeout=15' --password --set ON_ERROR_STOP=1 --file $driverFile
if ($LASTEXITCODE -ne 0) {
    throw "Staging $Action failed. Changes MAY have committed; keep $evidenceRoot and audit before any retry."
}
$manifest.executed=$true
[System.IO.File]::WriteAllText($manifestFile, ($manifest | ConvertTo-Json), $utf8)
Write-Host "Staging $Action SQL and structural checks completed. Share before/after CSV files, not passwords."
Write-Host 'This is not API delivery/Realtime verification. STOP here before the next phase. Production was not targeted.'
