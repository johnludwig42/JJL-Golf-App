param([Parameter(Mandatory=$true)][string]$SpecPath, [switch]$TestHarness, [string]$ProbeMode='', [string]$ManifestHash='')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\windows-job.ps1')
. (Join-Path $PSScriptRoot 'lib\broker.ps1')
. (Join-Path $PSScriptRoot 'lib\sweep.ps1')
$probeRoot=$null
if($ProbeMode){
    . (Join-Path $PSScriptRoot 'lib\probe-transport.ps1')
    if($ProbeMode -ceq 'fake' -and $TestHarness){
        $probeRoot=Get-DyeProbeRoot $SpecPath $ProbeMode $ManifestHash
        $spec=Convert-DyeProbeRoot $probeRoot $SpecPath $ManifestHash
    }elseif($ProbeMode -ceq 'live-nonmodel' -and -not $TestHarness){
        Assert-DyeLiveEnvironment
        . (Join-Path $PSScriptRoot 'lib\stage2-area.ps1')
        $probeRoot=Get-DyeLiveProbeRoot $SpecPath $ManifestHash
        $spec=Convert-DyeLiveProbeRoot $probeRoot $SpecPath $ManifestHash
        . (Import-DyePinnedScript (Join-Path $PSScriptRoot 'lib\job-attest.ps1') $spec.attestHash)
        . (Import-DyePinnedScript (Join-Path $PSScriptRoot 'lib\identity-collector.ps1') $spec.identityHash)
    }else{throw 'Probe launcher mode gate'}
}else{
    if($ManifestHash){throw 'Unexpected manifest hash'}
    $spec = Read-FakeSpec $SpecPath -TestHarness:$TestHarness
}
$child = $null
$areaHandles=$null
$steps=@{}; $single=$false
try {
    if($ProbeMode -ceq 'live-nonmodel'){$areaHandles=Assert-DyeStage2Area $probeRoot -Hold}
    if($ProbeMode -ceq 'live-nonmodel' -and $spec.runClass -ceq 'live-real'){
        $before=Get-DyeInventoryRunObservation $probeRoot
        Write-DyeLiveRecord (Join-Path $spec.cwd 'inventory-before.json') (ConvertTo-Json $before -Compress -Depth 30)
        if($before.status -cne 'OK'){throw 'Inventory observation incomplete; no command launched'}
        # The collector already selects the exact approval-bound sandbox SIDs.
        # Do not weaken the empty-set gate by guessing account RID suffixes.
        $sandbox=@($before.processes.Processes)
        if($sandbox.Count){throw 'Sandbox users busy; no command launched'}
    }
    [DyeJobs.Process]::WatchConsole($SpecPath+'.console-event.json')
    $child = New-Object DyeJobs.Process($spec.executable, [string[]]$spec.args, $spec.cwd, $spec.stdout, $spec.stderr)
    if($ProbeMode -ceq 'live-nonmodel'){
        try{$attestation=New-Object DyeStage2.JobAttest+Recorder($child.Job.ToInt64(),(Join-Path $spec.cwd 'jobs\J0-attest.jsonl'),'J0',$spec.nonce)}catch{}
        $identity=[DyeStage2.Identity]::Start($child.Pid,$child.Created.ToString())
    }
    Write-JobRecord $spec.ready @{ pid=$child.Pid; created=$child.Created.ToString(); job=$child.Job.ToInt64().ToString(); launcher=$PID;launcherCreated=[DyeJobs.Process]::CreationTime($PID).ToString();consoleWindow=[DyeJobs.Process]::ConsoleWindow().ToString() }
    $deadline = [DateTime]::UtcNow.AddMilliseconds([double]$spec.totalMs + [double]$spec.graceMs)
    $reason = 'child_exit'
    while ($true) {
        if ([DyeJobs.Process]::OwnerStop -or ($spec.ownerStop -and (Test-Path -LiteralPath $spec.ownerStop))) { $reason='owner_interrupt';$child.Kill();break }
        if ($spec.brokerSpec -and -not $single -and (Test-Path -LiteralPath $spec.brokerSpec)) { $steps[$spec.brokerSpec]=Start-DyeStep $spec.brokerSpec $spec $child; $single=$true }
        if ($spec.stepsDir) {
            foreach ($request in @(Get-ChildItem -LiteralPath $spec.stepsDir -Filter '*.request.json' -File)) {
                if($null -ne $probeRoot -and -not (Test-Path -LiteralPath ($request.FullName+'.published'))){continue}
                if (-not $steps.ContainsKey($request.FullName)) { $steps[$request.FullName]=Start-DyeStep $request.FullName $spec $child $probeRoot $SpecPath $ManifestHash }
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
    if($ProbeMode -ceq 'live-nonmodel' -and -not [DyeJobs.Process]::ConsoleClosing){
        $attestationComplete=$false
        if($attestation){try{$attestationComplete=$attestation.Finish(100)}catch{}}
        Assert-DyeStage2Area $probeRoot
        Write-DyeLiveRecord (Join-Path $spec.cwd 'jobs\J0-finish.json') (ConvertTo-Json @{complete=[bool]$attestationComplete;runNonce=$spec.nonce} -Compress)
        $identityRecord=$null
        if($identity.Status -eq [Threading.Tasks.TaskStatus]::RanToCompletion){$identityRecord=$identity.Result}
        Write-DyeLiveRecord (Join-Path $spec.cwd 'jobs\J0-identity.json') (ConvertTo-Json ([ordered]@{runNonce=$spec.nonce;identity=$identityRecord}) -Compress)
        if($spec.heldPayload){
            Assert-DyePayloadDeployment $spec.heldPayload
            Write-DyeLiveRecord (Join-Path $spec.cwd 'payload-after.json') (ConvertTo-Json $spec.payloadRecord -Compress)
        }
        if($spec.runClass -ceq 'live-real'){
            $after=Get-DyeInventoryRunObservation $probeRoot
            Write-DyeLiveRecord (Join-Path $spec.cwd 'inventory-after.json') (ConvertTo-Json $after -Compress -Depth 30)
        }
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 97
} finally { if($attestation){try{$attestation.Dispose()}catch{}}; foreach($entry in $steps.Values){if(-not $entry.recorded){$entry.owner.Kill();$entry.owner.Dispose()}};if ($null -ne $child) { $child.Dispose() };foreach($handle in $areaHandles){$handle.Dispose()};if($spec.heldPayload){$spec.heldPayload.stream.Dispose()} }
