param([Parameter(Mandatory=$true)][string]$SpecPath, [switch]$TestHarness)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\windows-job.ps1')
$spec = Read-FakeSpec $SpecPath -TestHarness:$TestHarness
$child = $null
try {
    $deadline = [DateTime]::UtcNow.AddMilliseconds([double]$spec.stepMs)
    if($spec.deadlineUtc){$deadline=([DateTime]'1970-01-01Z').ToUniversalTime().AddMilliseconds([double]$spec.deadlineUtc)}
    if([DateTime]::UtcNow -ge $deadline){Write-JobRecord $spec.done @{reason='wrapper_step_deadline';exit=99;empty=$true;at=[DateTime]::UtcNow.ToString('o');action='refuse_expired_step'};exit 18}
    $child = New-Object DyeJobs.Process($spec.executable, [string[]]$spec.args, $spec.cwd, $spec.stdout, $spec.stderr)
    Write-JobRecord $spec.ready @{ pid=$child.Pid; created=$child.Created.ToString(); job=$child.Job.ToInt64().ToString(); wrapper=$PID;j1Member=[DyeJobs.Process]::Member($child.Pid,$child.Job.ToInt64()) }
    $reason = 'child_exit'
    while (-not $child.Exited) {
        if(Test-Path -LiteralPath ($SpecPath+'.cancel')){$reason='wrapper_cancelled';break}
        if ([DateTime]::UtcNow -ge $deadline) { $reason='wrapper_step_deadline'; break }
        if (-not $spec.disableParentWatch -and -not [DyeJobs.Process]::ParentAlive([int]$spec.parentPid,[long]$spec.parentCreated)) { $reason='wrapper_parent_death'; break }
        Start-Sleep -Milliseconds 10
    }
    $child.Kill()
    $emptyDeadline = [DateTime]::UtcNow.AddSeconds(2)
    while (-not $child.IsEmpty() -and [DateTime]::UtcNow -lt $emptyDeadline) { Start-Sleep -Milliseconds 10 }
    Write-JobRecord $spec.done @{ reason=$reason; exit=$child.ExitCode; empty=$child.IsEmpty();at=[DateTime]::UtcNow.ToString('o');action='terminate_J1';parentWatchDisabled=[bool]$spec.disableParentWatch }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 97
} finally { if ($null -ne $child) { $child.Dispose() } }
