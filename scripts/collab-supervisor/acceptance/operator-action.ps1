param([Parameter(Mandatory=$true)][string]$Request)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\lib\operator-gate.ps1')
Assert-DyeOperator # Direct invocation cannot bypass the operator gate.
. (Join-Path $PSScriptRoot '..\lib\windows-job.ps1')
$data=Get-Content -LiteralPath $Request -Raw | ConvertFrom-Json
if($data.action -eq 'wmi'){
    if($data.marker -notmatch '^dye-fake-[a-f0-9-]{36}$'){throw 'Bad fake marker'}
    $fixture=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\tests\fixtures\collab-supervisor\fake-agent.js'))
    if($fixture -ne [IO.Path]::GetFullPath([string]$data.fixture)){throw 'Only the fixed fake fixture is permitted'}
    $hasher=[Security.Cryptography.SHA256]::Create()
    try{$hash=[BitConverter]::ToString($hasher.ComputeHash([IO.File]::ReadAllBytes($fixture))).Replace('-','')}finally{$hasher.Dispose()}
    if($hash -ne $data.fixtureHash -or [IO.Path]::GetFileName($data.node) -ne 'node.exe'){throw 'Fixture/runtime pin mismatch'}
    Import-Module (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules\CimCmdlets\CimCmdlets.psd1') -ErrorAction Stop
    $command=[DyeJobs.Process]::Quote($data.node)+' '+[DyeJobs.Process]::Quote($fixture)+' hang '+[DyeJobs.Process]::Quote('--dye-run-marker='+$data.marker)
    # Exactly one WMI Create; no retry can start a second broker process.
    $created=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=$command;CurrentDirectory=[string]$data.cwd} -ErrorAction Stop
    if($created.ReturnValue -ne 0){throw 'WMI fake creation refused'}
    $info=[DyeJobs.Process]::Inspect([int]$created.ProcessId)
    if(-not $info.Known -or -not $info.Alive){throw 'WMI fake identity unavailable'}
    @{pid=[int]$created.ProcessId;createdAt=$info.Created.ToString()} | ConvertTo-Json -Compress
    exit
}
if($data.action -notin @('owner_interrupt','console_close')){throw 'Unknown operator case'}
$launch=[IO.Path]::GetFullPath([string]$data.launchSpec)
$spec=Read-FakeSpec $launch -TestHarness
if(-not $launch.StartsWith([IO.Path]::GetTempPath(),[StringComparison]::OrdinalIgnoreCase)){throw 'Test console must use OS Temp'}
$ps=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$launcher=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\launch.ps1'))
$owner=$null
try{
    # The only visible console belongs to this explicitly requested operator test.
    $ownerExecutable=$ps
    $ownerArguments=[string[]]@('-NoProfile','-ExecutionPolicy','Bypass','-File',$launcher,'-SpecPath',$launch,'-TestHarness')
    if($data.action -eq 'console_close'){
        $ownerExecutable=Join-Path $env:SystemRoot 'System32\conhost.exe'
        $ownerArguments=[string[]](@($ps)+$ownerArguments)
    }
    $owner=New-Object DyeJobs.Process($ownerExecutable,$ownerArguments,$spec.cwd,($launch+'.operator.stdout'),($launch+'.operator.stderr'),$false,0,$true)
    $deadline=[DateTime]::UtcNow.AddSeconds(40)
    while([DateTime]::UtcNow -lt $deadline){
        if($owner.Exited){throw 'Test launcher exited before its agent step'}
        if(Test-Path -LiteralPath $spec.ready){
            $members=@(Get-ChildItem -LiteralPath $spec.stepsDir -Filter '*.membership.json' -File)
            # Immutable membership/spool records; never open the replaced checkpoint.
            foreach($memberPath in $members){
                $member=Get-Content -LiteralPath $memberPath.FullName -Raw | ConvertFrom-Json
                $requestPath=$memberPath.FullName.Replace('.membership.json','')
                $step=Get-Content -LiteralPath $requestPath -Raw | ConvertFrom-Json
                if($member.j0Member -and $member.j1Member -and $step.args -contains 'hang'){break}
            }
            if($member -and $member.j0Member -and $member.j1Member -and $step.args -contains 'hang'){break}
        }
        Start-Sleep -Milliseconds 20
    }
    if([DateTime]::UtcNow -ge $deadline){throw 'Agent did not become ready in owned console'}
    $ready=Get-Content -LiteralPath $spec.ready -Raw | ConvertFrom-Json
    if($data.action -eq 'console_close'){
        $signalAt=[DateTime]::UtcNow
        $closeTrace=New-Object DyeJobs.Process+ConsoleCloseTrace
        try{
            [DyeJobs.Process]::CloseOwnedClassicConsole($owner.Pid,$owner.Created,[int]$ready.launcher,[long]$ready.launcherCreated,[long]$ready.consoleWindow,$owner.Job.ToInt64(),$closeTrace)
        }catch{
            Write-JobRecord ($launch+'.close-refused.json') @{outcome='refused';reason=$_.Exception.Message;trace=$closeTrace;at=[DateTime]::UtcNow.ToString('o')}
            throw
        }
        Write-JobRecord ($launch+'.close-posted.json') @{outcome='posted_not_yet_delivered';trace=$closeTrace;hostPid=$owner.Pid;hostCreated=$owner.Created.ToString();launcherPid=$ready.launcher;launcherCreated=$ready.launcherCreated;window=$ready.consoleWindow;at=[DateTime]::UtcNow.ToString('o')}
        $deadline=$signalAt.AddSeconds(8)
        do{
            $launcherInfo=[DyeJobs.Process]::Inspect([int]$ready.launcher)
            if(-not $launcherInfo.Known){throw 'Launcher exit inspection failed'}
            $launcherAlive=$launcherInfo.Alive -and $launcherInfo.Created -eq [long]$ready.launcherCreated
            if($launcherAlive){Start-Sleep -Milliseconds 20}
        }while($launcherAlive -and [DateTime]::UtcNow -lt $deadline)
        if(-not (Test-Path -LiteralPath ($launch+'.console-event.json'))){
            Write-JobRecord ($launch+'.close-refused.json') @{outcome='refused';reason='close not delivered';trace=$closeTrace;at=[DateTime]::UtcNow.ToString('o')}
            throw 'close not delivered'
        }
        $closeEvent=Get-Content -LiteralPath ($launch+'.console-event.json') -Raw | ConvertFrom-Json
        if($closeEvent.kind -ne 2){throw 'Expected CTRL_CLOSE handler entry'}
        Write-JobRecord ($launch+'.close-delivered.json') @{outcome='delivered';handlerEntry=$closeEvent;at=[DateTime]::UtcNow.ToString('o')}
        if($launcherAlive){throw 'Console close did not terminate launcher within 8 s'}
    }else{
        if([int]$ready.launcher -ne $owner.Pid -or [long]$ready.launcherCreated -ne $owner.Created){throw 'Owned console PID mismatch'}
        [DyeJobs.Process]::SignalOwnedConsole($owner.Pid,$owner.Created,[long]$ready.consoleWindow,$false)
        $deadline=[DateTime]::UtcNow.AddSeconds(15)
        while(-not $owner.Exited -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 20}
        if(-not $owner.Exited){throw 'Console stop failed to terminate test launcher'}
    }
    $owner.Kill()
    $deadline=[DateTime]::UtcNow.AddSeconds(2)
    while(-not $owner.IsEmpty() -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 10}
    if(-not $owner.IsEmpty()){throw 'Owned console left descendants'}
    @{result='PASS';action=$data.action;rootPid=$owner.Pid;rootCreated=$owner.Created.ToString();empty=$true;at=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress
}finally{if($null -ne $owner){$owner.Kill();$owner.Dispose()}}
