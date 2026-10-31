param([Parameter(Mandatory=$true)][string]$SpecPath, [switch]$TestHarness)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\windows-job.ps1')
. (Join-Path $PSScriptRoot 'lib\broker.ps1')
. (Join-Path $PSScriptRoot 'lib\sweep.ps1')
$spec = Read-FakeSpec $SpecPath -TestHarness:$TestHarness
$child = $null
$steps=@{}; $single=$false
try {
    [DyeJobs.Process]::WatchConsole($SpecPath+'.console-event.json')
    $child = New-Object DyeJobs.Process($spec.executable, [string[]]$spec.args, $spec.cwd, $spec.stdout, $spec.stderr)
    Write-JobRecord $spec.ready @{ pid=$child.Pid; created=$child.Created.ToString(); job=$child.Job.ToInt64().ToString(); launcher=$PID;launcherCreated=[DyeJobs.Process]::CreationTime($PID).ToString();consoleWindow=[DyeJobs.Process]::ConsoleWindow().ToString() }
    $deadline = [DateTime]::UtcNow.AddMilliseconds([double]$spec.totalMs + [double]$spec.graceMs)
    $reason = 'child_exit'
    while ($true) {
        if ([DyeJobs.Process]::OwnerStop -or ($spec.ownerStop -and (Test-Path -LiteralPath $spec.ownerStop))) { $reason='owner_interrupt';$child.Kill();break }
        if ($spec.brokerSpec -and -not $single -and (Test-Path -LiteralPath $spec.brokerSpec)) { $steps[$spec.brokerSpec]=Start-DyeStep $spec.brokerSpec $spec $child; $single=$true }
        if ($spec.stepsDir) {
            foreach ($request in @(Get-ChildItem -LiteralPath $spec.stepsDir -Filter '*.request.json' -File)) {
                if (-not $steps.ContainsKey($request.FullName)) { $steps[$request.FullName]=Start-DyeStep $request.FullName $spec $child }
            }
        }
        foreach ($entry in $steps.Values) { if(-not $entry.recorded){Update-DyeStep $entry $child} }
        if ([DateTime]::UtcNow -ge $deadline) { $reason='launcher_total_deadline'; $child.Kill(); break }
        if ($child.Exited -and -not $spec.disableLauncherExitWatch) { $reason='node_exited';$child.Kill(); break }
        if ($child.Exited -and $spec.disableLauncherExitWatch -and (Test-Path -LiteralPath $spec.wrapperDone)) { $reason='wrapper_alone'; break }
        Start-Sleep -Milliseconds 10
    }
    $child.Kill()
    $emptyDeadline = [DateTime]::UtcNow.AddMilliseconds([Math]::Min(2000,[DyeJobs.Process]::ConsoleCloseRemainingMs()-500))
    while (-not $child.IsEmpty() -and [DateTime]::UtcNow -lt $emptyDeadline) { Start-Sleep -Milliseconds 10 }
    $sweep=$null
    if([DyeJobs.Process]::ConsoleClosing){
        # WMI enumeration has no reliable sub-four-second completion bound.
        # Preserve the lock for recover rather than claim a sweep we cannot finish.
        $sweep=@{result='NOT_RUN';reason='console_close_time_limit';escapes=@();survivors=@()}
    } elseif($spec.marker -and $spec.agentFixture) { $sweep=Invoke-DyeSweep $spec.marker $spec.agentFixture ([double]$spec.startedAt) $child.Job.ToInt64() }
    Write-JobRecord $spec.done @{ reason=$reason; exit=$child.ExitCode; empty=$child.IsEmpty();at=[DateTime]::UtcNow.ToString('o');action='terminate_J0';sweep=$sweep;consoleClosing=[DyeJobs.Process]::ConsoleClosing;launcherExitWatchDisabled=[bool]$spec.disableLauncherExitWatch }
    # Unblocks the close handler only after the completion record is on disk.
    [DyeJobs.Process]::CompleteConsoleStop()
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 97
} finally { foreach($entry in $steps.Values){if(-not $entry.recorded){$entry.owner.Kill();$entry.owner.Dispose()}};if ($null -ne $child) { $child.Dispose() } }
