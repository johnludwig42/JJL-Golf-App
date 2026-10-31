# The launcher starts these native siblings of Node. They never inherit the
# coordinator's libuv job. Both siblings are assigned to J0 before resuming.
function Start-DyeStep([string]$SpecPath,$RootSpec,$Coordinator) {
    $step = Read-FakeSpec $SpecPath -TestHarness
    if ([int]$step.parentPid -ne $Coordinator.Pid -or [string]$step.parentCreated -ne $Coordinator.Created.ToString()) { throw 'Step parent identity mismatch' }
    $psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $wrapper = Join-Path $PSScriptRoot '..\run-step.ps1'
    $old=@{}
    try {
        if($step.env){foreach($entry in $step.env.PSObject.Properties){
            if($entry.Name -notmatch '^(SystemRoot|PATH|GIT_DIR|GIT_WORK_TREE|GIT_CONFIG_NOSYSTEM|GIT_CONFIG_GLOBAL|GIT_ATTR_NOSYSTEM|GIT_TERMINAL_PROMPT|GIT_CONFIG_COUNT|GIT_CONFIG_(KEY|VALUE)_\d+)$'){throw 'Unapproved child environment key'}
            $old[$entry.Name]=[Environment]::GetEnvironmentVariable($entry.Name);[Environment]::SetEnvironmentVariable($entry.Name,[string]$entry.Value)
        }}
        $owner = New-Object DyeJobs.Process($psExe,[string[]]@('-NoProfile','-ExecutionPolicy','Bypass','-File',$wrapper,'-SpecPath',$SpecPath,'-TestHarness'),$RootSpec.cwd,($SpecPath+'.wrapper.stdout'),($SpecPath+'.wrapper.stderr'),$false,$Coordinator.Job.ToInt64())
    } finally {foreach($key in $old.Keys){[Environment]::SetEnvironmentVariable($key,$old[$key])}}
    if ($step.wrapperPid) { [IO.File]::WriteAllText([string]$step.wrapperPid,$owner.Pid.ToString()) }
    return @{owner=$owner;step=$step;path=$SpecPath;released=$false;recorded=$false}
}
function Update-DyeStep($Entry,$Coordinator) {
    $step=$Entry.step
    if (-not $Entry.released -and (Test-Path -LiteralPath $step.ready)) {
        $agent=Get-Content -LiteralPath $step.ready -Raw | ConvertFrom-Json
        $info=[DyeJobs.Process]::Inspect([int]$agent.pid)
        $member=$null
        if($info.Alive){$member=[DyeJobs.Process]::Member([int]$agent.pid,$Coordinator.Job.ToInt64())}
        elseif($step.release){throw 'Agent exited before membership could be observed'}
        Write-JobRecord ($Entry.path+'.membership.json') @{pid=$agent.pid;j0Member=$member;j1Member=$agent.j1Member;at=[DateTime]::UtcNow.ToString('o')}
        if ($step.release) { [IO.File]::WriteAllText([string]$step.release,'release') }
        $Entry.released=$true
    }
    if (Test-Path -LiteralPath ($Entry.path+'.cancel')) {
        if(-not $Entry.cancelAt){$Entry.cancelAt=[DateTime]::UtcNow.AddSeconds(1)}
        elseif([DateTime]::UtcNow -ge $Entry.cancelAt){$Entry.owner.Kill()}
    }
    if ($Entry.owner.Exited -and -not $Entry.recorded) {
        # Keep Jw open without killing it. Otherwise this backup would mask a
        # broken J1 kill-on-wrapper-close in the isolation test and live runtime.
        $drain=[DateTime]::UtcNow.AddSeconds(2)
        while(-not $Entry.owner.IsEmpty() -and [DateTime]::UtcNow -lt $drain){Start-Sleep -Milliseconds 10}
        $natural=$Entry.owner.IsEmpty()
        if(-not $natural){$Entry.owner.Kill();Start-Sleep -Milliseconds 50}
        $reply=@{wrapperExit=$Entry.owner.ExitCode;empty=$Entry.owner.IsEmpty();drainedBeforeFallback=$natural;at=[DateTime]::UtcNow.ToString('o');action=$(if($natural){'observe_Jw_empty'}else{'terminate_Jw_fallback'})}
        $Entry.owner.Dispose();$Entry.recorded=$true
        Write-JobRecord ($Entry.path+'.reply.json') $reply
    }
}
