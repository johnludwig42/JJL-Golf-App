# Canonical Stage 1a protocol. Probe inputs NEVER use ConvertFrom-Json/Read-FakeSpec.
# The existing lock and operational job records retain their existing formats.
$script:ProbeKeys='schema type mode run_id request_id probe_id manifest_hash request_hash registry_hash config_hash config_path transport_path transport_hash executable executable_hash fixture fixture_hash cwd stdout stderr ready done steps_dir total_ms grace_ms marker started_at owner_stop agent_fixture parent_pid parent_created launcher_pid launcher_created wrapper_pid wrapper_created coordinator_pid coordinator_created deadline_utc step_ms lock_path consume_path receipt_path manifest_path argv_count env_count approval_hash release repository'.Split(' ')
$script:ProbeIntegers='schema total_ms grace_ms started_at parent_pid launcher_pid wrapper_pid coordinator_pid deadline_utc step_ms argv_count env_count'.Split(' ')
$script:ProbePaths='config_path transport_path executable fixture cwd stdout stderr ready done steps_dir owner_stop agent_fixture lock_path consume_path receipt_path manifest_path release repository'.Split(' ')
$script:ProbeExisting='config_path transport_path executable fixture cwd steps_dir agent_fixture manifest_path repository'.Split(' ')
$script:ProbeKeys+=@('powershell_executable','powershell_hash','git_executable','git_hash')
$script:ProbePaths+=@('powershell_executable','git_executable')
$script:ProbeExisting+=@('powershell_executable','git_executable')
if(-not ('DyeProbeFile' -as [type])){
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class DyeProbeFile {
 [StructLayout(LayoutKind.Sequential)] public struct Info {
  public uint attrs; public System.Runtime.InteropServices.ComTypes.FILETIME c,a,w;
  public uint volume,hi,lo,links,indexHi,indexLo;
 }
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFile(string p,uint a,uint s,IntPtr z,uint d,uint f,IntPtr t);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info i);
 public static uint Links(string p) {
  using(var h=CreateFile(p,0,7,IntPtr.Zero,3,0x02000000,IntPtr.Zero)) {
   Info i;if(h.IsInvalid || !GetFileInformationByHandle(h,out i))throw new Exception("File metadata unavailable");return i.links;
  }
 }
}
'@
}
function Get-DyeProbeHash([string]$Path){
    $sha=[Security.Cryptography.SHA256]::Create()
    try{return ([BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($Path)))).Replace('-','')}
    finally{$sha.Dispose()}
}
function Get-DyeProbePath([string]$Path,[bool]$Output=$false){
    return Get-DyeProbePathCore $Path $Output $false
}
function Get-DyeExpectedPowerShellPath {
    $builtDirectory=[IO.Path]::GetFullPath((Join-Path $env:SystemRoot 'System32'))
    $osDirectory=[IO.Path]::GetFullPath([Environment]::SystemDirectory)
    if(-not [StringComparer]::OrdinalIgnoreCase.Equals($builtDirectory,$osDirectory)){throw 'SystemRoot does not match OS system directory'}
    return [IO.Path]::Combine($env:SystemRoot,'System32\WindowsPowerShell\v1.0\powershell.exe')
}
function Get-DyeSystemPowerShellPath {
    $expected=Get-DyeExpectedPowerShellPath
    [void](Get-DyeProbePathCore $expected $false $true)
    return $expected
}
function Get-DyePowerShellTuple([string]$Path){
    $expected=Get-DyeSystemPowerShellPath
    if(-not [StringComparer]::Ordinal.Equals($Path,$expected)){throw 'Exact system PowerShell spelling required'}
    return $expected.ToUpperInvariant()
}
function Get-DyeProbePathCore([string]$Path,[bool]$Output,[bool]$SystemPowerShell){
    # Even a direct helper call cannot extend the compiled exception to another path.
    if($SystemPowerShell -and ($Output -or -not [StringComparer]::Ordinal.Equals($Path,(Get-DyeExpectedPowerShellPath)))){throw 'Fixed system PowerShell path required'}
    if($Path -cnotmatch '^[A-Za-z]:[\\/]' -or $Path -cnotmatch '^[\x20-\x7e]+$'){throw 'Drive-absolute ASCII path required'}
    $normal=$Path.Replace('/','\');$parts=$normal.Substring(3).Split('\');$current=$normal.Substring(0,3)
    for($i=0;$i -lt $parts.Length;$i++){
        $part=$parts[$i]
        if(-not $part -or $part -ceq '.' -or $part -ceq '..' -or $part -cmatch '[. ]$|[:*?"<>|]|~[0-9]'){throw 'Ambiguous path spelling'}
        $current=[IO.Path]::Combine($current,$part)
        if(-not (Test-Path -LiteralPath $current)){
            if($Output -and $i -eq $parts.Length-1){break};throw 'Missing path component'
        }
        $item=Get-Item -LiteralPath $current -Force
        if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Reparse path refused'}
        if(-not [StringComparer]::OrdinalIgnoreCase.Equals($item.Name,$part)){throw 'Short path refused'}
        $fixedRuntime=$SystemPowerShell -and $i -eq $parts.Length-1
        if(-not $item.PSIsContainer){
            $links=[DyeProbeFile]::Links($current)
            if($links -lt 1 -or ($links -ne 1 -and -not $fixedRuntime)){throw 'Hard link refused'}
        }
        if($fixedRuntime -and ($item.PSIsContainer -or -not ($item -is [IO.FileInfo]))){throw 'Regular system PowerShell file required'}
        if($i -lt $parts.Length-1 -and -not $item.PSIsContainer){throw 'Parent is not a directory'}
    }
    if(-not [StringComparer]::Ordinal.Equals([IO.Path]::GetFullPath($normal),$normal)){throw 'Noncanonical path'}
    return $normal.ToUpperInvariant()
}
function Read-DyeProbeWire([string]$Path,[string]$Hash='', [bool]$Paths=$true){
    [void](Get-DyeProbePath $Path)
    if($Hash -and (Get-DyeProbeHash $Path) -cne $Hash){throw 'Wire hash mismatch'}
    $text=(New-Object Text.UTF8Encoding($false,$true)).GetString([IO.File]::ReadAllBytes($Path))
    if($text.Length -gt 65536 -or -not $text.EndsWith("`n") -or $text.Contains("`r") -or $text[0] -cne '{'){throw 'Wire framing'}
    $pattern='\G"([a-z][a-z0-9_]*)":("(?:[\x20-\x21\x23-\x5b\x5d-\x7e]|\\["\\])*"|0|[1-9][0-9]*)'
    $map=New-Object 'Collections.Generic.Dictionary[string,object]' ([StringComparer]::Ordinal)
    $position=1;$previous=''
    while($text[$position] -cne '}'){
        # Match with an explicit start, so \G cannot skip invalid text.
        $regex=New-Object Text.RegularExpressions.Regex($pattern)
        $match=$regex.Match($text,$position)
        if(-not $match.Success -or $match.Index -ne $position){throw 'Noncanonical token'}
        $key=$match.Groups[1].Value;$token=$match.Groups[2].Value
        if([StringComparer]::Ordinal.Compare($key,$previous) -le 0 -or (-not ($script:ProbeKeys -ccontains $key) -and $key -cnotmatch '^(argv_[0-9]{4}|env_[0-9]{4}_(name|value))$')){throw 'Unknown duplicate or unsorted field'}
        $previous=$key;$position=$match.Index+$match.Length
        if($token[0] -ceq '"'){
            if($script:ProbeIntegers -ccontains $key){throw 'Integer required'}
            $value=[regex]::Replace($token.Substring(1,$token.Length-2),'\\(["\\])','$1')
        } else {
            if(-not ($script:ProbeIntegers -ccontains $key)){throw 'String required'}
            $value=[long]::Parse($token,[Globalization.CultureInfo]::InvariantCulture)
            if($value -gt 9007199254740991){throw 'Unsafe integer'}
        }
        if(($key -ceq 'argv_count' -or $key -ceq 'env_count') -and $value -gt 32){throw 'Indexed field limit'}
        if($key -ceq 'schema' -and $value -ne 1){throw 'Unknown wire schema'}
        if(($key -ceq 'total_ms' -or $key -ceq 'step_ms') -and ($value -lt 1 -or $value -gt 120000)){throw 'Synthetic time limit'}
        if($key -ceq 'grace_ms' -and $value -gt 2000){throw 'Grace limit'}
        if($key.EndsWith('_hash') -and $value -cnotmatch '^[A-F0-9]{64}$'){throw 'Hash spelling'}
        if($key.EndsWith('_created') -and ($value -cnotmatch '^[1-9][0-9]{0,18}$' -or [decimal]$value -gt 9223372036854775807)){throw 'FILETIME spelling'}
        if($key -ceq 'mode' -and $value -cne 'fake'){throw 'Live mode refused'}
        if($key -ceq 'type' -and -not (@('manifest','request','consumption','started','vector') -ccontains $value)){throw 'Unknown type'}
        if($key -ceq 'probe_id' -and -not (@('version','auth','refusal') -ccontains $value)){throw 'Unknown probe'}
        if($Paths -and $key -ceq 'powershell_executable'){$value=Get-DyePowerShellTuple $value}
        elseif($Paths -and $script:ProbePaths -ccontains $key){$value=Get-DyeProbePath $value (-not ($script:ProbeExisting -ccontains $key))}
        $map.Add($key,$value)
        if($text[$position] -ceq ','){$position++;if($text[$position] -ceq '}'){throw 'Trailing comma'}}else{break}
    }
    if($text.Substring($position) -cne "}`n"){throw 'Trailing data'}
    if($map['schema'] -ne 1 -or $map['mode'] -cne 'fake' -or -not (@('manifest','request','consumption','started','vector') -ccontains $map['type'])){throw 'Required wire header'}
    if($Paths -and $map.ContainsKey('powershell_executable') -and (Get-DyeProbeHash (Get-DyeSystemPowerShellPath)) -cne $map['powershell_hash']){throw 'System PowerShell hash mismatch'}
    foreach($prefix in @('argv','env')){
        $count=0;if($map.ContainsKey($prefix+'_count')){$count=[int]$map[$prefix+'_count']}
        $names=@($map.Keys | Where-Object {$_.StartsWith($prefix+'_') -and $_ -cne ($prefix+'_count')})
        $factor=1;if($prefix -ceq 'env'){$factor=2}
        if($names.Count -ne $count*$factor){throw 'Indexed field count'}
        for($i=0;$i -lt $count;$i++){
            $stem=$prefix+'_'+$i.ToString('D4')
            if($prefix -ceq 'argv'){if(-not $map.ContainsKey($stem)){throw 'Indexed gap'}}
            elseif(-not $map.ContainsKey($stem+'_name') -or -not $map.ContainsKey($stem+'_value')){throw 'Indexed gap'}
        }
    }
    return ,$map
}
function Write-DyeProbeWire([string]$Path,$Row){
    [void](Get-DyeProbePath $Path $true)
    $keys=[string[]]@($Row.Keys);[Array]::Sort($keys,[StringComparer]::Ordinal)
    $parts=@();foreach($key in $keys){
        $value=$Row[$key]
        if($value -is [string]){$token='"'+$value.Replace('\','\\').Replace('"','\"')+'"'}else{$token=$value.ToString([Globalization.CultureInfo]::InvariantCulture)}
        $parts+='"'+$key+'":'+$token
    }
    $bytes=(New-Object Text.UTF8Encoding($false,$true)).GetBytes('{'+($parts -join ',')+"}`n")
    $stream=New-Object IO.FileStream($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
    try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
    [void](Read-DyeProbeWire $Path)
}
function Assert-DyeProbeFields($Row,[string[]]$Required){
    foreach($key in $Required){if(-not $Row.ContainsKey($key)){throw "Missing probe field: $key"}}
    if($Row['schema'] -ne 1 -or $Row['mode'] -cne 'fake'){throw 'Unknown probe contract'}
}
function Set-DyeProbeEnvironment($Root){
    # No legacy step.env copy. Only these manifest-sealed values enter the child.
    for($i=0;$i -lt [int]$Root['env_count'];$i++){
        $stem='env_'+$i.ToString('D4');$name=[string]$Root[$stem+'_name'];$value=[string]$Root[$stem+'_value']
        if(-not (@('SystemRoot','WINDIR','COMSPEC','LANG','LC_ALL','PATH','TEMP','TMP','DYE_SUPERVISOR_CHILD','DYE_SUPERVISOR_TEST','DYE_A5_OPERATOR') -ccontains $name)){throw 'Unapproved sealed environment'}
        if($name -ceq 'PATH' -and $value -cne ''){throw 'Probe PATH must be empty'}
        [Environment]::SetEnvironmentVariable($name,$value)
    }
}
function Get-DyeProbeRoot([string]$Path,[string]$Mode,[string]$Hash){
    if($Mode -cne 'fake' -or $env:DYE_SUPERVISOR_TEST -cne '1' -or $Hash -cnotmatch '^[A-F0-9]{64}$'){throw 'Synthetic probe gate refused'}
    $row=Read-DyeProbeWire $Path $Hash
    Assert-DyeProbeFields $row @('type','run_id','registry_hash','approval_hash','config_path','config_hash','transport_path','transport_hash','executable','executable_hash','fixture','fixture_hash','agent_fixture','repository','cwd','stdout','stderr','ready','done','steps_dir','total_ms','grace_ms','deadline_utc','marker','started_at','owner_stop','lock_path','argv_count','env_count')
    Assert-DyeProbeFields $row @('powershell_executable','powershell_hash','git_executable','git_hash')
    if($row['type'] -cne 'manifest' -or $row['run_id'] -cnotmatch '^dye-fake-[a-f0-9-]{36}$' -or $row['marker'] -cne $row['run_id']){throw 'Manifest identity'}
    $coordinator=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\coordinator.js')).ToUpperInvariant()
    $fixture=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\tests\fixtures\collab-supervisor\fake-agent.js')).ToUpperInvariant()
    if($row['fixture'] -cne $coordinator -or $row['agent_fixture'] -cne $fixture -or [IO.Path]::GetFileName($row['executable']) -cne 'NODE.EXE'){throw 'Fixed fake targets required'}
    foreach($pair in @(@('executable','executable_hash'),@('fixture','fixture_hash'),@('config_path','config_hash'),@('transport_path','transport_hash'))){if((Get-DyeProbeHash $row[$pair[0]]) -cne $row[$pair[1]]){throw 'Pinned input changed'}}
    $expectedPs=(Get-DyeSystemPowerShellPath).ToUpperInvariant()
    if($row['powershell_executable'] -cne $expectedPs -or [IO.Path]::GetFileName($row['git_executable']) -cne 'GIT.EXE'){throw 'Fixed runtime paths required'}
    if((Get-DyeProbeHash $row['powershell_executable']) -cne $row['powershell_hash'] -or (Get-DyeProbeHash $row['git_executable']) -cne $row['git_hash']){throw 'Pinned runtime changed'}
    $temp=([IO.Path]::GetTempPath()).TrimEnd('\').ToUpperInvariant()+'\'
    foreach($key in @('repository','cwd','steps_dir','config_path','transport_path','stdout','stderr','ready','done','owner_stop','lock_path')){if(-not $row[$key].StartsWith($temp,[StringComparison]::Ordinal) -or $row[$key].StartsWith('C:\PROJECTS\',[StringComparison]::Ordinal)){throw 'Probe data must be in Temp'}}
    if([long]$row['deadline_utc'] -ne ([long]$row['started_at']+[long]$row['total_ms'])){throw 'Deadline binding'}
    return ,$row
}
function Convert-DyeProbeRoot($Root,[string]$Path,[string]$Hash){
    Set-DyeProbeEnvironment $Root
    $coordinator=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\coordinator.js'))
    return @{executable=$Root['executable'];args=@($coordinator,'--sealed-probe',$Path,$Hash,('--dye-run-marker='+$Root['marker']));cwd=$Root['cwd'];stdout=$Root['stdout'];stderr=$Root['stderr'];ready=$Root['ready'];done=$Root['done'];stepsDir=$Root['steps_dir'];totalMs=[Math]::Max(1,([long]$Root['deadline_utc']-[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()));graceMs=$Root['grace_ms'];marker=$Root['marker'];agentFixture=$Root['agent_fixture'];startedAt=$Root['started_at'];ownerStop=$Root['owner_stop']}
}
function Assert-DyeProbeLock($Root,[int]$NodePid,[string]$NodeCreated,[int]$LauncherPid,[string]$LauncherCreated){
    # Reuse the existing lock's wire format, then independently inspect both identities.
    $lock=[IO.File]::ReadAllText($Root['lock_path']) | ConvertFrom-Json
    if($lock.runId -cne $Root['run_id'] -or [int]$lock.node.pid -ne $NodePid -or [string]$lock.node.createdAt -cne $NodeCreated -or [int]$lock.launcher.pid -ne $LauncherPid -or [string]$lock.launcher.createdAt -cne $LauncherCreated){throw 'Current lock mismatch'}
    if(-not [DyeJobs.Process]::ParentAlive($NodePid,[long]$NodeCreated) -or -not [DyeJobs.Process]::ParentAlive($LauncherPid,[long]$LauncherCreated)){throw 'Lock owner is not alive'}
}
function Get-DyeProbeRequest([string]$Path,$Root,[string]$ManifestHash){
    if(-not (Test-Path -LiteralPath ($Path+'.published'))){throw 'Request not published'}
    [void](Get-DyeProbePath ($Path+'.published'))
    if((Get-Item -LiteralPath ($Path+'.published')).Length -ne 0){throw 'Invalid publication marker'}
    $row=Read-DyeProbeWire $Path
    Assert-DyeProbeFields $row @('type','run_id','request_id','probe_id','manifest_hash','registry_hash','executable','executable_hash','fixture','fixture_hash','cwd','stdout','stderr','ready','done','release','parent_pid','parent_created','step_ms','deadline_utc','argv_count')
    if($row['type'] -cne 'request' -or $row['manifest_hash'] -cne $ManifestHash -or $row['run_id'] -cne $Root['run_id'] -or $row['registry_hash'] -cne $Root['registry_hash'] -or $row['request_id'] -cnotmatch '^[a-f0-9-]{36}$'){throw 'Request binding mismatch'}
    if($Path.ToUpperInvariant() -cne ([IO.Path]::Combine($Root['steps_dir'],$row['request_id']+'.request.json')).ToUpperInvariant()){throw 'Request filename mismatch'}
    if($row['executable'] -cne $Root['executable'] -or $row['executable_hash'] -cne $Root['executable_hash'] -or $row['fixture'] -cne $Root['agent_fixture'] -or (Get-DyeProbeHash $row['fixture']) -cne $row['fixture_hash'] -or (Get-DyeProbeHash $row['executable']) -cne $row['executable_hash']){throw 'Step target mismatch'}
    $scenarios=@{version='probe-version';auth='probe-auth';refusal='probe-refusal'}
    if($row['argv_count'] -ne 4 -or $row['argv_0000'].ToUpperInvariant() -cne $Root['agent_fixture'] -or $row['argv_0001'] -cne $scenarios[$row['probe_id']] -or $row['argv_0002'] -cne ('--dye-run-marker='+$Root['marker']) -or -not $row['argv_0003'].StartsWith('--release-file=',[StringComparison]::Ordinal) -or (Get-DyeProbePath $row['argv_0003'].Substring(15) $true) -cne $row['release']){throw 'Fixed argv required'}
    foreach($key in @('stdout','stderr','ready','done','release')){if($row[$key] -cne ($Path+'.'+$key+$(if($key -ceq 'ready' -or $key -ceq 'done'){'.json'}else{''})).ToUpperInvariant()){throw 'Output binding'}}
    if([long]$row['deadline_utc'] -gt [long]$Root['deadline_utc'] -or [long]$row['deadline_utc'] -gt ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+[long]$row['step_ms']) -or [long]$row['deadline_utc'] -le [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()){throw 'Expired or widened step deadline'}
    # Repository is a marked Temp fixture; cwd cannot point outside that marker.
    $temp=([IO.Path]::GetTempPath()).TrimEnd('\').ToUpperInvariant()+'\'
    if($row['cwd'] -cne $Root['repository'] -or -not $row['cwd'].StartsWith($temp,[StringComparison]::Ordinal) -or -not (Test-Path -LiteralPath (Join-Path $row['cwd'] '.dye-supervisor-fake.json'))){throw 'Synthetic working directory required'}
    return ,$row
}
function Convert-DyeProbeStep($Row){
    return @{executable=$Row['executable'];args=@($Row['argv_0000'],$Row['argv_0001'],$Row['argv_0002'],$Row['argv_0003']);cwd=$Row['cwd'];stdout=$Row['stdout'];stderr=$Row['stderr'];ready=$Row['ready'];done=$Row['done'];release=$Row['release'];parentPid=$Row['parent_pid'];parentCreated=$Row['parent_created'];stepMs=$Row['step_ms'];deadlineUtc=$Row['deadline_utc']}
}
function New-DyeProbeConsumption([string]$Path,$Root,[string]$ManifestHash,$Coordinator){
    $row=Get-DyeProbeRequest $Path $Root $ManifestHash
    if($row['parent_pid'] -ne $Coordinator.Pid -or $row['parent_created'] -cne $Coordinator.Created.ToString()){throw 'Coordinator identity mismatch'}
    $launcherCreated=[DyeJobs.Process]::CreationTime($PID).ToString()
    Assert-DyeProbeLock $Root $Coordinator.Pid $Coordinator.Created.ToString() $PID $launcherCreated
    $consume=$Path+'.consumed.json'
    Write-DyeProbeWire $consume @{schema=1;type='consumption';mode='fake';run_id=$row['run_id'];request_id=$row['request_id'];probe_id=$row['probe_id'];manifest_hash=$ManifestHash;request_hash=(Get-DyeProbeHash $Path);registry_hash=$Root['registry_hash'];launcher_pid=$PID;launcher_created=$launcherCreated;coordinator_pid=$Coordinator.Pid;coordinator_created=$Coordinator.Created.ToString();deadline_utc=$row['deadline_utc']}
    return @{step=(Convert-DyeProbeStep $row);consume=$consume}
}
function Confirm-DyeProbeStart([string]$Path,[string]$ManifestPath,[string]$ManifestHash,[string]$Consume){
    $root=Get-DyeProbeRoot $ManifestPath 'fake' $ManifestHash
    $row=Get-DyeProbeRequest $Path $root $ManifestHash
    if($Consume.ToUpperInvariant() -cne ($Path+'.consumed.json').ToUpperInvariant()){throw 'Consumption path mismatch'}
    $used=Read-DyeProbeWire $Consume
    foreach($key in @('run_id','request_id','probe_id','manifest_hash','registry_hash','deadline_utc')){if($used[$key] -cne $row[$key]){throw 'Consumption binding mismatch'}}
    if($used['type'] -cne 'consumption' -or $used['request_hash'] -cne (Get-DyeProbeHash $Path)){throw 'Consumed request changed'}
    Import-Module (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules\CimCmdlets\CimCmdlets.psd1') -ErrorAction Stop
    $self=Get-CimInstance -Query "SELECT ProcessId,ParentProcessId,CreationDate FROM Win32_Process WHERE ProcessId=$PID" -OperationTimeoutSec 3 -ErrorAction Stop
    $parent=[int]$self.ParentProcessId;$created=[DyeJobs.Process]::CreationTime($PID).ToString()
    if($parent -ne $used['launcher_pid'] -or -not [DyeJobs.Process]::ParentAlive($parent,[long]$used['launcher_created']) -or [long]$used['launcher_created'] -ge [long]$created){throw 'Actual parent identity mismatch'}
    Assert-DyeProbeLock $root $used['coordinator_pid'] $used['coordinator_created'] $parent $used['launcher_created']
    Write-DyeProbeWire ($Path+'.started.json') @{schema=1;type='started';mode='fake';run_id=$used['run_id'];request_id=$used['request_id'];manifest_hash=$ManifestHash;request_hash=$used['request_hash'];launcher_pid=$parent;launcher_created=$used['launcher_created'];wrapper_pid=$PID;wrapper_created=$created;deadline_utc=$used['deadline_utc']}
    Set-DyeProbeEnvironment $root
    return Convert-DyeProbeStep $row
}
