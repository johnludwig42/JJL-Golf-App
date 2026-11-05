param([Parameter(Mandatory=$true)][string]$SpecPath, [switch]$TestHarness, [string]$ProbeMode='', [string]$ManifestPath='', [string]$ManifestHash='', [string]$ConsumptionPath='')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\windows-job.ps1')
if($ProbeMode){
    . (Join-Path $PSScriptRoot 'lib\probe-transport.ps1')
    if($ProbeMode -ceq 'fake' -and $TestHarness){
        $spec=Confirm-DyeProbeStart $SpecPath $ManifestPath $ManifestHash $ConsumptionPath
    }elseif($ProbeMode -ceq 'live-nonmodel' -and -not $TestHarness){
        Assert-DyeLiveEnvironment
        . (Join-Path $PSScriptRoot 'lib\stage2-area.ps1')
        $spec=Confirm-DyeLiveProbeStart $SpecPath $ManifestPath $ManifestHash $ConsumptionPath
        if($spec.claude){
            $env:DISABLE_AUTOUPDATER='1'
            $env:CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC='1'
        }
        . (Import-DyePinnedScript (Join-Path $PSScriptRoot 'lib\job-attest.ps1') $spec.attestHash)
        if($ProbeMode -ceq 'live-nonmodel' -and $spec.outputRoute -ceq 'memory-shape'){
            . (Import-DyePinnedScript (Join-Path $PSScriptRoot 'lib\auth-shape.ps1') $spec.authShapeHash)
        }
    }else{throw 'Probe wrapper mode gate'}
}else{
    if($ManifestPath -or $ManifestHash -or $ConsumptionPath){throw 'Unexpected probe parameters'}
    $spec = Read-FakeSpec $SpecPath -TestHarness:$TestHarness
}
$child = $null
try {
    $deadline = [DateTime]::UtcNow.AddMilliseconds([double]$spec.stepMs)
    if($spec.deadlineUtc){$deadline=([DateTime]'1970-01-01Z').ToUniversalTime().AddMilliseconds([double]$spec.deadlineUtc)}
    if([DateTime]::UtcNow -ge $deadline){Write-JobRecord $spec.done @{reason='wrapper_step_deadline';exit=99;empty=$true;at=[DateTime]::UtcNow.ToString('o');action='refuse_expired_step'};exit 18}
    if($ProbeMode -ceq 'live-nonmodel' -and $spec.outputRoute -ceq 'memory-shape'){
        $captureTimer=[Diagnostics.Stopwatch]::StartNew()
        $output=New-Object DyeJobs.Capture
        $errors=New-Object DyeJobs.Capture
        $child=New-Object DyeJobs.Process($spec.executable,[string[]]$spec.args,$spec.cwd,$output,$errors)
    }else{
        $child = New-Object DyeJobs.Process($spec.executable, [string[]]$spec.args, $spec.cwd, $spec.stdout, $spec.stderr)
    }
    if($ProbeMode -ceq 'live-nonmodel'){
        try{$attestation=New-Object DyeStage2.JobAttest+Recorder($child.Job.ToInt64(),(Join-Path $spec.cwd 'jobs\J1-attest.jsonl'),'J1',$spec.nonce)}catch{}
        $member=$null
        try{$member=[DyeJobs.Process]::Member($child.Pid,$child.Job.ToInt64())}catch{}
        $ready=[ordered]@{pid=$child.Pid;created=$child.Created.ToString();wrapper=$PID;j1Member=$member;mode=$spec.mode;run_class=$spec.runClass}
        Write-DyeLiveRecord $spec.ready (ConvertTo-Json $ready -Compress)
    }else{
        Write-JobRecord $spec.ready @{ pid=$child.Pid; created=$child.Created.ToString(); job=$child.Job.ToInt64().ToString(); wrapper=$PID;j1Member=[DyeJobs.Process]::Member($child.Pid,$child.Job.ToInt64()) }
    }
    $reason = 'child_exit'
    while (-not $child.Exited) {
        if(Test-Path -LiteralPath ($SpecPath+'.cancel')){$reason='wrapper_cancelled';break}
        if ([DateTime]::UtcNow -ge $deadline) { $reason='wrapper_step_deadline'; break }
        if (-not $spec.disableParentWatch -and -not [DyeJobs.Process]::ParentAlive([int]$spec.parentPid,[long]$spec.parentCreated)) { $reason='wrapper_parent_death'; break }
        Start-Sleep -Milliseconds 10
    }
    if($attestation){try{$attestation.Request('pre-terminate');$attestation.TerminationStarting()}catch{}}
    $child.Kill()
    $emptyDeadline = [DateTime]::UtcNow.AddSeconds(2)
    while (-not $child.IsEmpty() -and [DateTime]::UtcNow -lt $emptyDeadline) { Start-Sleep -Milliseconds 10 }
    $done=@{reason=$reason;exit=$child.ExitCode;empty=$child.IsEmpty();at=[DateTime]::UtcNow.ToString('o');action='terminate_J1';parentWatchDisabled=[bool]$spec.disableParentWatch}
    if($ProbeMode -ceq 'live-nonmodel'){
        $done.mode=$spec.mode;$done.run_class=$spec.runClass
        if($attestation){try{$done.attestationComplete=$attestation.Finish(100)}catch{$done.attestationComplete=$false}}
        else{$done.attestationComplete=$false}
        if($ProbeMode -ceq 'live-nonmodel' -and $spec.outputRoute -ceq 'memory-shape'){
            $stop=$null
            switch -CaseSensitive ($reason){
                'wrapper_cancelled' {$stop='CANCELLED'}
                'wrapper_step_deadline' {$stop='TIMEOUT'}
                'wrapper_parent_death' {$stop='PARENT_DEATH'}
            }
            if(!$stop -and (!$done.empty -or !$child.WaitCaptures(1000))){$stop='CAPTURE_INCOMPLETE'}
            if(!$stop -and ($output.Faulted -or $errors.Faulted)){$stop='CAPTURE_FAULT'}
            if(!$stop -and ($output.Overflow -or $errors.Overflow)){$stop='OVERSIZE'}
            if($stop){$projection=@{stop=$stop}}
            else{$projection=[DyeStage2.AuthShape]::Project($output,$errors,$spec.authJson) | ConvertFrom-Json}
            $shape=[ordered]@{mode=$spec.mode;run_class=$spec.runClass;exitCode=$done.exit;stdoutTotal=$output.Total;stderrTotal=$errors.Total;durationMs=[long]$captureTimer.ElapsedMilliseconds;projection=$projection}
            Assert-DyeStage2Area $spec.areaRoot
            Write-DyeLiveRecord $spec.shape (ConvertTo-Json $shape -Compress -Depth 80)
            $done.capture=@{route='memory-shape';status=$(if($projection.stop){$projection.stop}else{'OBSERVED'})}
        }
        Assert-DyeStage2Area $spec.areaRoot
        Write-DyeLiveRecord $spec.done (ConvertTo-Json $done -Compress -Depth 8)
    }else{Write-JobRecord $spec.done $done}
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 97
} finally { if($attestation){try{$attestation.Dispose()}catch{}}; if ($null -ne $child) { $child.Dispose() } }
