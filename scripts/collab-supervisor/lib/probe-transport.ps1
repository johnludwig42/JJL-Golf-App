# Canonical Stage 1a protocol. Probe inputs NEVER use ConvertFrom-Json/Read-FakeSpec.
# The existing lock and operational job records retain their existing formats.
$script:ProbeKeys='schema type mode run_id request_id probe_id manifest_hash request_hash registry_hash config_hash config_path transport_path transport_hash executable executable_hash fixture fixture_hash cwd stdout stderr ready done steps_dir total_ms grace_ms marker started_at owner_stop agent_fixture parent_pid parent_created launcher_pid launcher_created wrapper_pid wrapper_created coordinator_pid coordinator_created deadline_utc step_ms lock_path consume_path receipt_path manifest_path argv_count env_count approval_hash release repository'.Split(' ')
$script:ProbeIntegers='schema total_ms grace_ms started_at parent_pid launcher_pid wrapper_pid coordinator_pid deadline_utc step_ms argv_count env_count'.Split(' ')
$script:ProbePaths='config_path transport_path executable fixture cwd stdout stderr ready done steps_dir owner_stop agent_fixture lock_path consume_path receipt_path manifest_path release repository'.Split(' ')
$script:ProbeExisting='config_path transport_path executable fixture cwd steps_dir agent_fixture manifest_path repository'.Split(' ')
$script:ProbeKeys+=@('powershell_executable','powershell_hash','git_executable','git_hash')
$script:Stage2Keys='run_class output_route template_hash shape area_path area_record_hash area_volume area_file_id run_dir_file_id approval_file_id approval_path auth_shape_hash attest_hash identity_hash payload_hash payload_path payload_id worktree target_executable target_hash inventory_registry_hash inventory_bundle_hash'.Split(' ')
$script:Stage2Paths=@('shape','area_path','approval_path','payload_path','worktree','target_executable')
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
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateDirectory(string path,IntPtr security);
 public static void CreatePayloadDirectory(string path) {
  if(!CreateDirectory(path,IntPtr.Zero)) throw new InvalidOperationException("PAYLOAD_DIRECTORY_EXISTS_OR_DENIED");
 }
 public static string PayloadIdentity(SafeFileHandle handle) {
  Info i;
  if(handle.IsInvalid || !GetFileInformationByHandle(handle,out i) || i.links!=1 || (i.attrs&0x410)!=0)
   throw new InvalidOperationException("PAYLOAD_IDENTITY");
  return i.volume.ToString("X8")+":"+i.indexHi.ToString("X8")+i.indexLo.ToString("X8");
 }
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
function Get-DyePayloadDigest([IO.Stream]$Stream){
    $Stream.Position=0
    $sha=[Security.Cryptography.SHA256]::Create()
    try{return ([BitConverter]::ToString($sha.ComputeHash($Stream))).Replace('-','')}
    finally{$sha.Dispose();$Stream.Position=0}
}
function New-DyePayloadDeployment([string]$Source,[string]$ExpectedHash,[string]$Worktree){
    [void](Get-DyeProbePath $Source)
    [void](Get-DyeProbePath $Worktree)
    $temp=[IO.Path]::GetTempPath().TrimEnd('\')
    if($ExpectedHash -cnotmatch '^[A-F0-9]{64}$' -or
       [IO.Path]::GetDirectoryName($Worktree) -ine $temp -or
       [IO.Path]::GetFileName($Worktree) -cnotmatch '^dye-stage2-payload-[A-Za-z0-9]+$'){throw 'PAYLOAD_FIXTURE_PATH'}
    $bytes=[IO.File]::ReadAllBytes($Source)
    $memory=New-Object IO.MemoryStream(,$bytes)
    try{$digest=Get-DyePayloadDigest $memory}finally{$memory.Dispose()}
    if($digest -cne $ExpectedHash){throw 'PAYLOAD_SOURCE_HASH'}
    $folder=Join-Path $Worktree '.dye-stage2'
    [DyeProbeFile]::CreatePayloadDirectory($folder)
    $path=Join-Path $folder ('payload-'+$ExpectedHash.Substring(0,16)+'.mjs')
    $writer=New-Object IO.FileStream($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$writer.Write($bytes,0,$bytes.Length);$writer.Flush($true)}finally{$writer.Dispose()}
    $stream=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    try{
        $held=[ordered]@{path=$path;stream=$stream;id=[DyeProbeFile]::PayloadIdentity($stream.SafeFileHandle);
            size=$bytes.Length;sha256=$ExpectedHash}
        Assert-DyePayloadDeployment $held
        return $held
    }catch{$stream.Dispose();throw}
}
function Assert-DyePayloadDeployment($Held){
    [void](Get-DyeProbePath $Held.path)
    $current=[IO.File]::Open($Held.path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    try{
        if([DyeProbeFile]::PayloadIdentity($current.SafeFileHandle) -cne $Held.id -or
           [DyeProbeFile]::PayloadIdentity($Held.stream.SafeFileHandle) -cne $Held.id -or
           $Held.stream.Length -ne $Held.size -or (Get-DyePayloadDigest $Held.stream) -cne $Held.sha256){
            throw 'PAYLOAD_DEPLOYMENT_INVALID'
        }
    }finally{$current.Dispose()}
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
function Read-DyeProbeWire([string]$Path,[string]$Hash='', [bool]$Paths=$true,[string]$Mode='fake'){
    if($Mode -cne 'fake' -and $Mode -cne 'live-nonmodel'){throw 'Unknown wire mode'}
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
        $known=($script:ProbeKeys -ccontains $key) -or ($Mode -ceq 'live-nonmodel' -and $script:Stage2Keys -ccontains $key)
        if([StringComparer]::Ordinal.Compare($key,$previous) -le 0 -or (-not $known -and $key -cnotmatch '^(argv_[0-9]{4}|env_[0-9]{4}_(name|value))$')){throw 'Unknown duplicate or unsorted field'}
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
        if($key -ceq 'mode' -and $value -cne $Mode){throw 'Wire mode mismatch'}
        if($key -ceq 'type' -and -not (@('manifest','request','consumption','started','vector') -ccontains $value)){throw 'Unknown type'}
        if($key -ceq 'probe_id'){
            if($Mode -ceq 'fake' -and -not (@('version','auth','refusal') -ccontains $value)){throw 'Unknown probe'}
            if($Mode -ceq 'live-nonmodel' -and $value -cnotmatch '^[a-z][a-z0-9-]{0,31}$'){throw 'Unknown probe'}
        }
        if($Paths -and $key -ceq 'powershell_executable'){$value=Get-DyePowerShellTuple $value}
        elseif($Paths -and $script:ProbePaths -ccontains $key){$value=Get-DyeProbePath $value (-not ($script:ProbeExisting -ccontains $key))}
        elseif($Paths -and $script:Stage2Paths -ccontains $key){
            $resolved=Get-DyeProbePath $value ($key -ceq 'shape')
            if($key -cne 'area_path' -and $key -cne 'worktree'){$value=$resolved}
        }
        $map.Add($key,$value)
        if($text[$position] -ceq ','){$position++;if($text[$position] -ceq '}'){throw 'Trailing comma'}}else{break}
    }
    if($text.Substring($position) -cne "}`n"){throw 'Trailing data'}
    if($map['schema'] -ne 1 -or $map['mode'] -cne $Mode -or -not (@('manifest','request','consumption','started','vector') -ccontains $map['type'])){throw 'Required wire header'}
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
function Write-DyeProbeWire([string]$Path,$Row,[string]$Mode='fake'){
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
    [void](Read-DyeProbeWire $Path '' $true $Mode)
}
function Assert-DyeProbeFields($Row,[string[]]$Required,[string]$Mode='fake'){
    foreach($key in $Required){if(-not $Row.ContainsKey($key)){throw "Missing probe field: $key"}}
    if($Row['schema'] -ne 1 -or $Row['mode'] -cne $Mode){throw 'Unknown probe contract'}
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
    $mode=$Root['mode']
    if($mode -ceq 'live-nonmodel'){$row=Get-DyeLiveProbeRequest $Path $Root $ManifestHash}
    else{$row=Get-DyeProbeRequest $Path $Root $ManifestHash}
    if($row['parent_pid'] -ne $Coordinator.Pid -or $row['parent_created'] -cne $Coordinator.Created.ToString()){throw 'Coordinator identity mismatch'}
    $launcherCreated=[DyeJobs.Process]::CreationTime($PID).ToString()
    Assert-DyeProbeLock $Root $Coordinator.Pid $Coordinator.Created.ToString() $PID $launcherCreated
    $consume=$Path+'.consumed.json'
    $record=@{schema=1;type='consumption';mode=$mode;run_id=$row['run_id'];request_id=$row['request_id'];probe_id=$row['probe_id'];manifest_hash=$ManifestHash;request_hash=(Get-DyeProbeHash $Path);registry_hash=$Root['registry_hash'];launcher_pid=$PID;launcher_created=$launcherCreated;coordinator_pid=$Coordinator.Pid;coordinator_created=$Coordinator.Created.ToString();deadline_utc=$row['deadline_utc']}
    if($mode -ceq 'live-nonmodel'){$record.run_class=$Root['run_class'];$step=Convert-DyeLiveProbeStep $row $Root}
    else{$step=Convert-DyeProbeStep $row}
    Write-DyeProbeWire $consume $record $mode
    return @{step=$step;consume=$consume}
}
function Confirm-DyeProbeStart([string]$Path,[string]$ManifestPath,[string]$ManifestHash,[string]$Consume,[string]$Mode='fake'){
    if($Mode -ceq 'live-nonmodel'){
        $root=Get-DyeLiveProbeRoot $ManifestPath $ManifestHash
        $row=Get-DyeLiveProbeRequest $Path $root $ManifestHash
    }else{
        $root=Get-DyeProbeRoot $ManifestPath 'fake' $ManifestHash
        $row=Get-DyeProbeRequest $Path $root $ManifestHash
    }
    if($Consume.ToUpperInvariant() -cne ($Path+'.consumed.json').ToUpperInvariant()){throw 'Consumption path mismatch'}
    $used=Read-DyeProbeWire $Consume '' $true $Mode
    foreach($key in @('run_id','request_id','probe_id','manifest_hash','registry_hash','deadline_utc')){if($used[$key] -cne $row[$key]){throw 'Consumption binding mismatch'}}
    if($used['type'] -cne 'consumption' -or $used['request_hash'] -cne (Get-DyeProbeHash $Path)){throw 'Consumed request changed'}
    Import-Module (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules\CimCmdlets\CimCmdlets.psd1') -ErrorAction Stop
    $self=Get-CimInstance -Query "SELECT ProcessId,ParentProcessId,CreationDate FROM Win32_Process WHERE ProcessId=$PID" -OperationTimeoutSec 3 -ErrorAction Stop
    $parent=[int]$self.ParentProcessId;$created=[DyeJobs.Process]::CreationTime($PID).ToString()
    if($parent -ne $used['launcher_pid'] -or -not [DyeJobs.Process]::ParentAlive($parent,[long]$used['launcher_created']) -or [long]$used['launcher_created'] -ge [long]$created){throw 'Actual parent identity mismatch'}
    Assert-DyeProbeLock $root $used['coordinator_pid'] $used['coordinator_created'] $parent $used['launcher_created']
    $record=@{schema=1;type='started';mode=$Mode;run_id=$used['run_id'];request_id=$used['request_id'];manifest_hash=$ManifestHash;request_hash=$used['request_hash'];launcher_pid=$parent;launcher_created=$used['launcher_created'];wrapper_pid=$PID;wrapper_created=$created;deadline_utc=$used['deadline_utc']}
    if($Mode -ceq 'live-nonmodel'){
        if($used['run_class'] -cne $root['run_class']){throw 'Consumption class mismatch'}
        $record.run_class=$root['run_class']
    }
    Write-DyeProbeWire ($Path+'.started.json') $record $Mode
    Set-DyeProbeEnvironment $root
    if($Mode -ceq 'live-nonmodel'){return Convert-DyeLiveProbeStep $row $root}
    return Convert-DyeProbeStep $row
}

function Assert-DyeLiveEnvironment {
    foreach($key in @('DYE_SUPERVISOR_TEST','DYE_A5_OPERATOR')){
        if($null -ne [Environment]::GetEnvironmentVariable($key)){throw 'Live probe mode rejects test flags'}
    }
}
function Get-DyeInventoryResolution([string]$Role,[string[]]$Directories){
    if(@('codex','claude') -cnotcontains $Role){throw 'INVENTORY_ROLE'}
    $resolved=$null
    $checked=@()
    foreach($directory in $Directories){
        $canonical=Get-DyeProbePath $directory
        if(![IO.Directory]::Exists($canonical)){throw 'INVENTORY_PATH_DIRECTORY'}
        $checked+=$canonical
        $candidate=Join-Path $canonical ($Role+'.exe')
        if(!$resolved -and [IO.File]::Exists($candidate)){$resolved=Get-DyeProbePath $candidate}
    }
    return [ordered]@{role=$Role;path=$resolved;directories=$checked}
}
function Get-DyeInventoryPathObservation([string[]]$Paths){
    foreach($path in $Paths){
        $canonical=Get-DyeProbePath $path
        $directory=[IO.Directory]::Exists($canonical)
        $handle=New-Object DyeStage2.AreaHandle($canonical,$directory,$false)
        try {
            $descriptor=New-Object Security.AccessControl.RawSecurityDescriptor($handle.Sddl)
            [ordered]@{path=$canonical;id=$handle.FileId;volume=$handle.Volume;
                owner=$descriptor.Owner.Value;sddl=$handle.Sddl;directory=$directory}
        }finally{$handle.Dispose()}
    }
}
function Get-DyeInventorySystemObservation([string[]]$ToolPaths){
    $users=@(Get-LocalUser -ErrorAction Stop | Sort-Object SID | ForEach-Object {
        [ordered]@{name=$_.Name;sid=$_.SID.Value;enabled=[bool]$_.Enabled}
    })
    $groups=@(Get-LocalGroup -ErrorAction Stop | Sort-Object SID | ForEach-Object {
        [ordered]@{name=$_.Name;sid=$_.SID.Value}
    })
    $members=@(Get-LocalGroupMember -Group 'CodexSandboxUsers' -ErrorAction Stop |
        ForEach-Object {$_.SID.Value} | Sort-Object)
    $rules=@{}
    foreach($filter in @(Get-NetFirewallSecurityFilter -ErrorAction Stop)){
        if($filter.LocalUser -match '-100[34](?![0-9])'){
            foreach($rule in @(Get-NetFirewallRule -AssociatedNetFirewallSecurityFilter $filter -ErrorAction Stop)){$rules[$rule.Name]=$rule}
        }
    }
    foreach($filter in @(Get-NetFirewallApplicationFilter -ErrorAction Stop)){
        if($ToolPaths -icontains $filter.Program){
            foreach($rule in @(Get-NetFirewallRule -AssociatedNetFirewallApplicationFilter $filter -ErrorAction Stop)){$rules[$rule.Name]=$rule}
        }
    }
    $firewall=@(foreach($name in @($rules.Keys | Sort-Object)){
        $rule=$rules[$name]
        $application=@(Get-NetFirewallApplicationFilter -AssociatedNetFirewallRule $rule -ErrorAction Stop |
            Select-Object Program,Package)
        $security=@(Get-NetFirewallSecurityFilter -AssociatedNetFirewallRule $rule -ErrorAction Stop |
            Select-Object LocalUser,RemoteUser,RemoteMachine,Authentication,Encryption,OverrideBlockRules)
        $ports=@(Get-NetFirewallPortFilter -AssociatedNetFirewallRule $rule -ErrorAction Stop |
            Select-Object Protocol,LocalPort,RemotePort,IcmpType,DynamicTarget)
        $addresses=@(Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $rule -ErrorAction Stop |
            Select-Object LocalAddress,RemoteAddress)
        [ordered]@{name=$name;enabled=[string]$rule.Enabled;direction=[string]$rule.Direction;
            action=[string]$rule.Action;profile=[string]$rule.Profile;
            application=$application;security=$security;ports=$ports;addresses=$addresses}
    })
    return [ordered]@{users=$users;groups=$groups;sandboxMembers=$members;firewall=$firewall}
}
function Get-DyeInventoryFileObservation([string]$ToolPath,[string]$InstallFolder,[string[]]$ProfileFolders){
    $tool=Get-DyeProbePath $ToolPath
    $folder=Get-DyeProbePath $InstallFolder
    if(!$tool.StartsWith($folder+'\',[StringComparison]::Ordinal)){throw 'INVENTORY_INSTALL_LOCATION'}
    $profiles=@()
    foreach($profile in $ProfileFolders){
        $canonical=Get-DyeProbePath $profile
        if($folder -ceq $canonical -or $folder.StartsWith($canonical+'\',[StringComparison]::Ordinal) -or
           $canonical.StartsWith($folder+'\',[StringComparison]::Ordinal)){
            throw 'INVENTORY_PROFILE_INSTALL_NOT_RUN'
        }
        $handle=New-Object DyeStage2.AreaHandle($canonical,$true,$false)
        try{$profiles+=[ordered]@{path=$canonical;id=$handle.FileId;volume=$handle.Volume;lastWriteUtc=$handle.LastWriteUtc.ToString('o')}}
        finally{$handle.Dispose()}
    }
    $pending=New-Object 'Collections.Generic.Stack[string]'
    $pending.Push($folder)
    $entries=@()
    while($pending.Count){
        $directory=$pending.Pop()
        foreach($entry in [IO.Directory]::EnumerateFileSystemEntries($directory)){
            $path=Get-DyeProbePath $entry
            $isDirectory=[IO.Directory]::Exists($path)
            $handle=New-Object DyeStage2.AreaHandle($path,$isDirectory,$false)
            try {
                $row=[ordered]@{path=$path;directory=$isDirectory;id=$handle.FileId;size=$handle.Size;sha256=$null}
                if($isDirectory){$pending.Push($path)}else{$row.sha256=Get-DyeProbeHash $path}
                $entries+=$row
            }finally{$handle.Dispose()}
        }
    }
    $image=New-Object DyeStage2.AreaHandle($tool,$false,$true)
    try {
        $version=[Diagnostics.FileVersionInfo]::GetVersionInfo($tool)
        $pin=[ordered]@{path=$tool;id=$image.FileId;volume=$image.Volume;size=$image.Size;
            lastWriteUtc=$image.LastWriteUtc.ToString('o');sha256=(Get-DyeProbeHash $tool);
            version=$version.FileVersion;links=1}
    }finally{$image.Dispose()}
    return [ordered]@{image=$pin;install=@($entries | Sort-Object path);profiles=$profiles}
}
function Get-DyeInventoryProcessObservation([string[]]$OwnerSids){
    return Get-DyeProbeProcessObservation -Mode 'live-nonmodel' -RunClass 'live-real' -OwnerSids $OwnerSids
}
function Get-DyeInventoryRunObservation($Root){
    $snapshot=[ordered]@{status='INCOMPLETE';observedFiletime=[DateTime]::UtcNow.ToFileTimeUtc().ToString();
        files=$null;resolution=$null;paths=@();system=$null;processes=$null;error=$null}
    try {
        if($Root['run_class'] -cne 'live-real' -or $Root['probe_id'] -cnotmatch '^[cl]-'){throw 'INVENTORY_SCOPE'}
        if((Get-DyeProbeHash $Root['approval_path']) -cne $Root['approval_hash']){throw 'INVENTORY_APPROVAL_CHANGED'}
        $approval=([IO.File]::ReadAllText($Root['approval_path']) | ConvertFrom-Json).inventory
        $scope=$approval.observation
        $role=if($Root['probe_id'].StartsWith('c-')){'codex'}else{'claude'}
        if(!$scope -or !$scope.installFolders.$role -or @($scope.pathDirectories).Count -eq 0 -or
           @($scope.metadataPaths).Count -eq 0 -or @($scope.profileFolders).Count -eq 0 -or
           @($scope.sandboxSids).Count -ne 2){throw 'INVENTORY_SCOPE'}
        foreach($sid in $scope.sandboxSids){if($sid -cnotmatch '^S-1-5-21-[0-9-]+-100[34]$'){throw 'INVENTORY_SCOPE'}}
        if(@($scope.sandboxSids | Select-Object -Unique).Count -ne 2){throw 'INVENTORY_SCOPE'}
        $snapshot.files=Get-DyeInventoryFileObservation $Root['target_executable'] $scope.installFolders.$role $scope.profileFolders
        $snapshot.resolution=Get-DyeInventoryResolution $role $scope.pathDirectories
        if($snapshot.resolution.path -cne $Root['target_executable']){throw 'INVENTORY_RESOLUTION_CHANGED'}
        $snapshot.paths=@(Get-DyeInventoryPathObservation $scope.metadataPaths)
        $snapshot.system=Get-DyeInventorySystemObservation @($approval.tools.codex.path,$approval.tools.claude.path)
        foreach($sid in $scope.sandboxSids){if($snapshot.system.sandboxMembers -cnotcontains $sid){throw 'INVENTORY_MEMBERSHIP_CHANGED'}}
        $user=[Security.Principal.WindowsIdentity]::GetCurrent()
        try{$owner=$user.User.Value}finally{$user.Dispose()}
        $snapshot.processes=Get-DyeInventoryProcessObservation ([string[]](@($owner)+@($scope.sandboxSids)))
        if($snapshot.processes.Status -cne 'OK'){throw 'INVENTORY_PROCESS_INCOMPLETE'}
        $snapshot.status='OK'
    }catch{
        # No exception text or profile values enter an inventory status record.
        $snapshot.error='OBSERVATION_INCOMPLETE'
    }
    return $snapshot
}
function Confirm-DyeInventoryTarget($Root){
    $id=$Root['probe_id']
    if(@('c-v','c-h1','c-h2','c-h3','c-a','l-v','l-h1','l-h2','l-a') -cnotcontains $id){throw 'Inventory template required'}
    $registry='F89CCB19D2EA2ACB7799BAE2BDA4AEC596DA9D66F1ABC691B52098CBD8B5BD11'
    $paths=@('../coordinator.js','../launch.ps1','../run-step.ps1','./live-probes.js','./probe-contract.js',
        './probe-transport.ps1','./broker.ps1','./windows-job.ps1','./auth-shape.ps1','./auth.js','./job-attest.ps1',
        './identity-collector.ps1','./sweep.ps1','./stage2-area.ps1','./policy.js','./evidence.js','./lock.js','./processes.js')
    $text=''
    foreach($path in $paths){$text+=$path+' '+(Get-DyeProbeHash ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot $path))))+[char]10}
    $sha=[Security.Cryptography.SHA256]::Create()
    try{$bundle=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text))).Replace('-','')}
    finally{$sha.Dispose()}
    if($Root['inventory_registry_hash'] -cne $registry -or $Root['inventory_bundle_hash'] -cne $bundle){throw 'Inventory registry or bundle changed'}
    if((Get-DyeProbeHash $Root['approval_path']) -cne $Root['approval_hash']){throw 'Inventory approval changed'}
    $approval=([IO.File]::ReadAllText($Root['approval_path']) | ConvertFrom-Json).inventory
    if(!$approval -or $approval.kind -cne 'S2-C' -or $approval.mode -cne 'live-nonmodel' -or
       $approval.runClass -cne $Root['run_class'] -or $approval.runId -cne $Root['run_id'] -or
       $approval.inventoryRegistryHash -cne $registry -or $approval.bundleHash -cne $bundle -or
       $approval.providerContactAllowed -isnot [bool]){throw 'Inventory approval binding mismatch'}
    $ids=@($approval.templateIds)
    if($ids.Count -eq 0 -or @($ids | Select-Object -Unique).Count -ne $ids.Count -or $ids -cnotcontains $id){throw 'Inventory template not approved'}
    foreach($entry in $ids){if(@('c-v','c-h1','c-h2','c-h3','c-a','l-v','l-h1','l-h2','l-a') -cnotcontains $entry){throw 'Inventory cannot authorize probes'}}
    $role=if($id.StartsWith('c-')){'codex'}else{'claude'}
    $pin=$approval.tools.$role
    if(!$pin -or (Get-DyeProbePath $pin.path) -cne $Root['target_executable'] -or $pin.sha256 -cne $Root['target_hash'] -or
       (Get-DyeProbeHash $Root['target_executable']) -cne $pin.sha256){throw 'Inventory executable pin mismatch'}
    $environment=$approval.environments.$role
    if($null -eq $environment){throw 'Inventory environment missing'}
    $names=@($environment.PSObject.Properties.Name | Sort-Object)
    if($role -ceq 'codex'){
        if($names.Count -ne 0){throw 'Inventory environment mismatch'}
    }elseif(($names -join '|') -cne 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC|DISABLE_AUTOUPDATER' -or
        $environment.DISABLE_AUTOUPDATER -cne '1' -or $environment.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC -cne '1'){
        throw 'Inventory environment mismatch'
    }
}
function Get-DyeLiveProbeRoot([string]$Path,[string]$Hash){
    Assert-DyeLiveEnvironment
    if($Hash -cnotmatch '^[A-F0-9]{64}$'){throw 'Manifest hash required'}
    $root=Read-DyeProbeWire $Path $Hash $true 'live-nonmodel'
    Assert-DyeProbeFields $root @('type','run_class','run_id','marker','cwd','steps_dir','ready','done','stdout','stderr','owner_stop','lock_path',
        'area_path','area_record_hash','area_volume','area_file_id','run_dir_file_id','approval_file_id','approval_path','approval_hash','fixture','fixture_hash',
        'executable','executable_hash','target_executable','target_hash','powershell_executable','powershell_hash','auth_shape_hash','attest_hash','identity_hash','started_at','total_ms',
        'deadline_utc','grace_ms','registry_hash','argv_count','transport_hash') 'live-nonmodel'
    if($root['type'] -cne 'manifest' -or @('live-test','live-real') -cnotcontains $root['run_class'] -or
        $root['run_id'] -cnotmatch '^dye-live-[a-f0-9-]{36}$' -or $root['marker'] -cne $root['run_id']){throw 'Live test manifest required'}
    $fixture=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\tests\fixtures\collab-supervisor\fake-cli.mjs')).ToUpperInvariant()
    $fixtureHash='8001DAC8B3AECE12862DC8A8CA1ABA69338DF30205A145F0D1773669F606AB96'
    if($root['fixture'] -cne $fixture -or $root['fixture_hash'] -cne $fixtureHash -or
       (Get-DyeProbeHash $fixture) -cne $fixtureHash -or [IO.Path]::GetFileName($root['executable']) -cne 'NODE.EXE' -or
       $root['executable_hash'] -cne '46BA90A735E256C76AF1CB1FF799876B4B18140F9A93418DE8ECE7965B1AD512' -or
       (Get-DyeProbeHash $root['executable']) -cne $root['executable_hash']){throw 'Pinned synthetic CLI required'}
    if($root['run_class'] -ceq 'live-test'){
        if($root['target_executable'] -cne $root['executable'] -or $root['target_hash'] -cne $root['executable_hash']){throw 'Pinned synthetic target required'}
    }else{
        if($root['area_path'] -cne 'C:\Projects\dye-ledger-evidence\_stage2' -or
           $root['probe_id'] -cnotmatch '^[cl]-' -or
           $root['target_executable'] -ceq $root['executable']){throw 'Protected inventory target required'}
    }
    $cwd=[IO.Path]::GetDirectoryName((Get-DyeProbePath $Path))
    if($root['cwd'] -cne $cwd){throw 'Live run location mismatch'}
    foreach($entry in @(@('steps_dir','STEPS'),@('ready','LAUNCH-READY.JSON'),@('done','LAUNCH-DONE.JSON'),
      @('stdout','COORDINATOR.OUT'),@('stderr','COORDINATOR.ERR'),@('owner_stop','OWNER-STOP'),@('lock_path','GLOBAL.LOCK'))){
        if($root[$entry[0]] -cne (Join-Path $cwd $entry[1])){throw 'Live root path binding'}
    }
    $coordinator=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\coordinator.js'))
    if($root['argv_count'] -ne 2 -or $root['argv_0000'] -cne $coordinator -or $root['argv_0001'] -cne '--sealed-live-probe' -or
      (Get-DyeProbeHash $coordinator) -cne $root['transport_hash'] -or
      [long]$root['deadline_utc'] -ne ([long]$root['started_at']+[long]$root['total_ms']) -or
      [long]$root['deadline_utc'] -le [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()){throw 'Live root execution binding'}
    if(-not ('DyeStage2.AreaHandle' -as [type])){. (Join-Path $PSScriptRoot 'stage2-area.ps1')}
    Assert-DyeStage2Area $root
    if($root['probe_id'] -cmatch '^[cl]-') {Confirm-DyeInventoryTarget $root}
    return ,$root
}
function Convert-DyeLiveProbeRoot($Root,[string]$Path,[string]$Hash){
    $spec=@{executable=$Root['executable'];args=@($Root['argv_0000'],$Root['argv_0001'],$Path,$Hash);cwd=$Root['cwd'];
      stdout=$Root['stdout'];stderr=$Root['stderr'];ready=$Root['ready'];done=$Root['done'];stepsDir=$Root['steps_dir'];
      totalMs=[Math]::Max(1,([long]$Root['deadline_utc']-[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()));graceMs=$Root['grace_ms'];
      ownerStop=$Root['owner_stop'];mode=$Root['mode'];runClass=$Root['run_class'];attestHash=$Root['attest_hash'];identityHash=$Root['identity_hash'];nonce=$Root['run_id']}
    if($Root['probe_id'] -ceq 'payload-identity'){
        if($Root['payload_hash'] -cne 'CE09F5AD996B15EE5589E7B97EF5FAF232F8AB6CFECDA630B31EC84BB11BC4AA'){throw 'PAYLOAD_SOURCE_HASH'}
        $source=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\acceptance\stage2-probe-payload.mjs'))
        $held=New-DyePayloadDeployment $source $Root['payload_hash'] $Root['worktree']
        $record=[ordered]@{path=$held.path;id=$held.id;size=$held.size;sha256=$held.sha256}
        try{Write-DyeLiveRecord (Join-Path $spec.cwd 'payload-before.json') (ConvertTo-Json $record -Compress)}
        catch{$held.stream.Dispose();throw}
        $spec.heldPayload=$held
        $spec.payloadRecord=$record
    }
    return $spec
}
function Get-DyeLiveProbeRequest([string]$Path,$Root,[string]$ManifestHash){
    $marker=Get-DyeProbePath ($Path+'.published')
    if((Get-Item -LiteralPath $marker).Length -ne 0){throw 'Invalid live publication marker'}
    $row=Read-DyeProbeWire $Path '' $true 'live-nonmodel'
    Assert-DyeProbeFields $row @('type','run_class','run_id','request_id','probe_id','template_hash','manifest_hash','registry_hash',
        'executable','executable_hash','fixture','fixture_hash','cwd','output_route','ready','done','parent_pid','parent_created',
        'step_ms','deadline_utc','argv_count') 'live-nonmodel'
    if($row['type'] -cne 'request' -or $row['run_class'] -cne $Root['run_class'] -or
       $row['run_id'] -cne $Root['run_id'] -or $row['manifest_hash'] -cne $ManifestHash -or
       $row['registry_hash'] -cne $Root['registry_hash'] -or $row['request_id'] -cnotmatch '^[a-f0-9-]{36}$' -or
       (Get-DyeProbePath $Path) -cne (Join-Path $Root['steps_dir'] ($row['request_id'].ToUpperInvariant()+'.REQUEST.JSON'))){throw 'Live request binding'}
    if($row['executable'] -cne $Root['target_executable'] -or $row['executable_hash'] -cne $Root['target_hash'] -or
       (Get-DyeProbeHash $row['executable']) -cne $Root['target_hash']){throw 'Live executable pin mismatch'}
    foreach($key in @('fixture','fixture_hash','cwd')){
        if($row[$key] -cne $Root[$key]){throw 'Live target mismatch'}
    }
    $operation=$row['probe_id']
    if($operation -cne $Root['probe_id']){throw 'Unknown live test template'}
    $template=Get-DyeLiveFixtureTemplate $operation
    $route=$template.route
    $real=$Root['run_class'] -ceq 'live-real'
    $expectedArgs=@($template.args)
    $targetDigest=$Root['fixture_hash']
    if($real){
        Confirm-DyeInventoryTarget $Root
        $expectedArgs=@($template.args | Select-Object -Skip 1)
        $targetDigest=$Root['target_hash']
    }
    $text=(@($operation,$route,$targetDigest)+$expectedArgs) -join '|'
    $hasher=[Security.Cryptography.SHA256]::Create()
    try{$templateHash=[BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($text))).Replace('-','')}
    finally{$hasher.Dispose()}
    if($row['template_hash'] -cne $templateHash -or $row['output_route'] -cne $route -or $row['step_ms'] -ne $template.timeoutMs -or
      $row.ContainsKey('release') -or $row.ContainsKey('env_count')){throw 'Live template mismatch'}
    if($operation -ceq 'payload-identity'){
        $expected=(Join-Path (Join-Path $Root['worktree'] '.dye-stage2') ('payload-'+$Root['payload_hash'].Substring(0,16)+'.mjs')).ToUpperInvariant()
        $nonce=$Root['run_id'].Substring(9).Replace('-','')
        if($Root['payload_hash'] -cne 'CE09F5AD996B15EE5589E7B97EF5FAF232F8AB6CFECDA630B31EC84BB11BC4AA' -or
           $row['payload_hash'] -cne $Root['payload_hash'] -or $row['payload_path'] -cne $expected -or
           $row['argv_count'] -ne 3 -or $row['argv_0000'].ToUpperInvariant() -cne $expected -or
           $row['argv_0001'] -cne 'identity' -or $row['argv_0002'] -cne $nonce){throw 'Payload argv binding'}
        $stream=[IO.File]::Open($expected,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
        try{
            $deployment=[IO.File]::ReadAllText((Join-Path $Root['cwd'] 'payload-before.json')) | ConvertFrom-Json
            if($deployment.path.ToUpperInvariant() -cne $expected -or $deployment.id -cne $row['payload_id'] -or
               $deployment.sha256 -cne $row['payload_hash']){throw 'Payload evidence binding'}
            Assert-DyePayloadDeployment @{path=$expected;stream=$stream;id=$row['payload_id'];size=$deployment.size;sha256=$row['payload_hash']}
        }finally{$stream.Dispose()}
    }elseif($real){
        if($row['argv_count'] -ne $expectedArgs.Count -or $row.ContainsKey('payload_path') -or
           $row.ContainsKey('payload_hash') -or $row.ContainsKey('payload_id')){throw 'Inventory argv mismatch'}
        for($i=0;$i -lt $expectedArgs.Count;$i++){
            if($row[('argv_'+$i.ToString('D4'))] -cne $expectedArgs[$i]){throw 'Inventory argv mismatch'}
        }
    }else{
        if($row['argv_count'] -ne ($template.args.Count+1) -or $row['argv_0000'].ToUpperInvariant() -cne $Root['fixture'] -or
            $row.ContainsKey('payload_path') -or $row.ContainsKey('payload_hash') -or $row.ContainsKey('payload_id')){throw 'Live template argv mismatch'}
        for($i=0;$i -lt $template.args.Count;$i++){
            if($row[('argv_'+($i+1).ToString('D4'))] -cne $template.args[$i]){throw 'Live template argv mismatch'}
        }
    }
    if($route -ceq 'memory-shape'){
        if($row.ContainsKey('stdout') -or $row.ContainsKey('stderr') -or $row['shape'] -cne ($Path+'.shape.json').ToUpperInvariant()){throw 'Memory output binding'}
    }elseif($row.ContainsKey('shape') -or $row['stdout'] -cne (Join-Path (Join-Path $Root['cwd'] 'raw') ($operation+'.out')).ToUpperInvariant() -or $row['stderr'] -cne (Join-Path (Join-Path $Root['cwd'] 'raw') ($operation+'.err')).ToUpperInvariant()){throw 'File output binding'}
    if($row['ready'] -cne ($Path+'.ready.json').ToUpperInvariant() -or $row['done'] -cne ($Path+'.done.json').ToUpperInvariant() -or
      [long]$row['deadline_utc'] -gt [long]$Root['deadline_utc'] -or
      [long]$row['deadline_utc'] -gt ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+[long]$row['step_ms']) -or
      [long]$row['deadline_utc'] -le [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()){throw 'Live step deadline or output binding'}
    return ,$row
}
function Convert-DyeLiveProbeStep($Row,$Root){
    $template=Get-DyeLiveFixtureTemplate $Row['probe_id']
    $argv=@(for($i=0;$i -lt $Row['argv_count'];$i++){$Row[('argv_'+$i.ToString('D4'))]})
    return @{executable=$Row['executable'];args=$argv;cwd=$Row['cwd'];stdout=$Row['stdout'];stderr=$Row['stderr'];
      ready=$Row['ready'];done=$Row['done'];parentPid=$Row['parent_pid'];parentCreated=$Row['parent_created'];stepMs=$Row['step_ms'];deadlineUtc=$Row['deadline_utc'];
      mode=$Row['mode'];runClass=$Row['run_class'];outputRoute=$Row['output_route'];shape=$Row['shape'];authShapeHash=$Root['auth_shape_hash'];
      attestHash=$Root['attest_hash'];nonce=$Row['run_id'];areaRoot=$Root;authJson=$template.json;claude=$template.args[0] -ceq 'claude'}
}
function Get-DyeLiveFixtureTemplate([string]$Id){
    $args=switch -CaseSensitive ($Id){
        'c-v' {'codex';'--version'}
        'c-h1' {'codex';'--help'}
        'c-h2' {'codex';'sandbox';'--help'}
        'c-h3' {'codex';'exec';'--help'}
        'c-a' {'codex';'login';'status'}
        'l-v' {'claude';'--version'}
        'l-h1' {'claude';'--help'}
        'l-h2' {'claude';'auth';'--help'}
        'l-a' {'claude';'auth';'status';'--json'}
        'auth' {'auth'}
        'version' {'version'}
        'overflow' {'overflow'}
        'hold' {'hold'}
        'cancel-hold' {'hold'}
        'parent-hold' {'hold'}
        'before-acl' {'auth'}
        'after-acl' {'auth'}
        'attest-fault' {'hold'}
        'pipe-hold' {'pipe-hold'}
        'limit' {'limit'}
        'stderr-limit' {'stderr-limit'}
        'stderr-overflow' {'stderr-overflow'}
        'marker' {'marker'}
        'ten-mib' {'ten-mib'}
        'nested-safe' {'nested-safe'}
        'nested-private' {'nested-private'}
        'jwt' {'jwt'}
        'long-hex' {'long-hex'}
        'long-base64' {'long-base64'}
        'invalid-utf8' {'invalid-utf8'}
        'duplicate' {'duplicate'}
        'sensitive-key' {'sensitive-key'}
        'not-json' {'not-json'}
        'payload-identity' {'identity'}
        default {throw 'Unknown live test template'}
    }
    $route=if($Id -cin @('c-a','l-a','auth','overflow','hold','cancel-hold','parent-hold','before-acl','after-acl','attest-fault','pipe-hold','limit','stderr-limit','stderr-overflow','marker','ten-mib',
        'nested-safe','nested-private','jwt','long-hex','long-base64','invalid-utf8','duplicate','sensitive-key','not-json')){'memory-shape'}else{'file'}
    $timeout=if($Id -cmatch '^[cl]-'){60000}elseif($Id -cin @('hold','attest-fault')){6000}else{15000}
    return @{args=@($args);route=$route;json=$Id -cne 'c-a';timeoutMs=$timeout}
}
function Confirm-DyeLiveProbeStart([string]$Path,[string]$ManifestPath,[string]$ManifestHash,[string]$Consume){
    return Confirm-DyeProbeStart $Path $ManifestPath $ManifestHash $Consume 'live-nonmodel'
}

function Import-DyePinnedScript([string]$Path,[string]$ExpectedHash){
    $bytes=[IO.File]::ReadAllBytes($Path)
    $sha=[Security.Cryptography.SHA256]::Create()
    try{$digest=[BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','')}
    finally{$sha.Dispose()}
    if($digest -cne $ExpectedHash){throw 'Pinned script changed'}
    return [scriptblock]::Create((New-Object Text.UTF8Encoding($false,$true)).GetString($bytes))
}

function Write-DyeLiveRecord([string]$Path,[string]$Json){
    [void](Get-DyeProbePath $Path $true)
    $scratch=Join-Path ([IO.Path]::GetDirectoryName($Path)) ([guid]::NewGuid().ToString('N')+'.tmp')
    $bytes=[Text.Encoding]::UTF8.GetBytes($Json+"`n")
    $file=New-Object IO.FileStream($scratch,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$file.Write($bytes,0,$bytes.Length);$file.Flush($true)}finally{$file.Dispose()}
    [IO.File]::Move($scratch,$Path)
}
