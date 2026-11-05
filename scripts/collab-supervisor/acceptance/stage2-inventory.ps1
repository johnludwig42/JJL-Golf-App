param(
    [Parameter(Mandatory=$true)][string]$SourcePath,
    [Parameter(Mandatory=$true)][string]$EntryHash,
    [Parameter(Mandatory=$true)][string]$BundleHash,
    [Parameter(Mandatory=$true)][string]$EvidenceRoot,
    [Parameter(Mandatory=$true)][string]$JournalPath,
    [Parameter(Mandatory=$true)][string]$JournalHash,
    [string]$CodexPath,
    [string]$ClaudePath,
    [switch]$Fixture
)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.ToString() -notmatch '^5\.1\.' -or
   $SourcePath -cnotmatch '\\scripts\\collab-supervisor\\acceptance\\stage2-inventory\.ps1$'){throw 'INVENTORY_RUNTIME'}
$utf8=New-Object Text.UTF8Encoding($false,$true)
function Digest([byte[]]$Bytes){
    $sha=[Security.Cryptography.SHA256]::Create()
    try{return [BitConverter]::ToString($sha.ComputeHash($Bytes)).Replace('-','')}
    finally{$sha.Dispose()}
}
$entry=[IO.File]::ReadAllBytes($SourcePath)
if($EntryHash -cnotmatch '^[A-F0-9]{64}$' -or (Digest $entry) -cne $EntryHash){throw 'INVENTORY_ENTRY_HASH'}
$base=Split-Path (Split-Path $SourcePath)
$lib=Join-Path $base 'lib'
$dependencies=[ordered]@{}
$bundle="stage2-inventory.ps1 $EntryHash`n"
foreach($name in @('probe-transport.ps1','stage2-area.ps1','setup-acl.ps1')){
    $bytes=[IO.File]::ReadAllBytes((Join-Path $lib $name))
    $bundle+="$name $(Digest $bytes)`n"
    $dependencies[$name]=$bytes
}
if($BundleHash -cnotmatch '^[A-F0-9]{64}$' -or (Digest ($utf8.GetBytes($bundle))) -cne $BundleHash){throw 'INVENTORY_BUNDLE_HASH'}
foreach($bytes in $dependencies.Values){. ([scriptblock]::Create($utf8.GetString($bytes)))}
$out=Join-Path $EvidenceRoot 'WP-AUTO-02'
$temp=[IO.Path]::GetTempPath().TrimEnd('\')+'\'
if($Fixture){
    if($env:DYE_SETUP_TEST -cne '1' -or !$EvidenceRoot.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -or
       $EvidenceRoot -cnotmatch '\\dye-stage2-area-[^\\]+\\' -or
       [IO.Path]::GetDirectoryName($JournalPath) -cne [IO.Path]::GetDirectoryName($EvidenceRoot) -or $CodexPath -or $ClaudePath){
        throw 'INVENTORY_FIXTURE_REQUIRED'
    }
}elseif($EvidenceRoot -cne 'C:\Projects\dye-ledger-evidence' -or [IO.Path]::GetDirectoryName($JournalPath) -cne $out){
    throw 'INVENTORY_LOCATION'
}
foreach($path in @($EvidenceRoot,$out,$JournalPath)){[void](Get-DyeProbePath $path)}
if($JournalHash -cnotmatch '^[A-F0-9]{64}$' -or (Get-DyeProbeHash $JournalPath) -cne $JournalHash){throw 'INVENTORY_JOURNAL_HASH'}
$journal=Read-B0Journal $JournalPath
if((Get-DyeProbeHash $JournalPath) -cne $JournalHash -or $journal.torn){throw 'INVENTORY_JOURNAL_CHANGED'}
$start=@($journal.rows | Where-Object event -ceq 'start')
if($start.Count -ne 1 -or @($journal.rows | Where-Object event -ceq 'verified').Count -ne 1){throw 'INVENTORY_JOURNAL_INCOMPLETE'}
$manifest=$start[0].manifest
if($manifest.evidenceRoot -cne $EvidenceRoot -or $manifest.control -cne (Join-Path $EvidenceRoot '_supervisor')){throw 'INVENTORY_JOURNAL_LOCATION'}
Assert-B0JournalScope $manifest $start[0].applyId $journal
$owner=[Security.Principal.WindowsIdentity]::GetCurrent()
try{
    if($owner.User.Value -cne $manifest.owner -or @($owner.Groups | Where-Object Value -ceq $manifest.deny).Count){throw 'INVENTORY_TOKEN'}
    if($Fixture -and $manifest.deny -cne 'S-1-5-7'){throw 'INVENTORY_FIXTURE_SID'}
}finally{$owner.Dispose()}
$applied=Get-B0ApplyObjects $journal
$objects=@($applied | Where-Object step -cne 'access-probe')
if(@($objects | Where-Object {!$_.done}).Count){throw 'INVENTORY_JOURNAL_INCOMPLETE'}
$control=$manifest.control+'\'
$fixtureRoot=[IO.Path]::GetDirectoryName($EvidenceRoot)+'\'
foreach($item in $objects){
    if($Fixture -and !$item.path.StartsWith($fixtureRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'INVENTORY_FIXTURE_PATH'}
    if($item.done.Kind -ceq 'directory' -and $item.path -cne $manifest.control -and
       !$item.path.StartsWith($control,[StringComparison]::Ordinal)){throw 'INVENTORY_DIRECTORY'}
    # Compare only metadata against Apply. The recorded content hash is never
    # read or copied into this inventory.
    $current=Get-B0Snapshot $item.path
    if($current.Id -cne $item.done.Id -or $current.Sddl -cne $item.done.Sddl -or
       $current.Owner -cne $item.done.Owner -or $current.Kind -cne $item.done.Kind -or
       ($current.Kind -ceq 'file' -and $current.Size -ne $item.done.Size)){throw "S1B_INVENTORY_CHANGED: $($item.step)"}
}
$targets=@($objects | ForEach-Object {[ordered]@{path=$_.path;kind=$_.done.Kind}})
$inventory=@(Get-DyeStage1bInventory $targets)
foreach($directory in @($inventory | Where-Object kind -ceq 'directory')){
    $expected=[string[]]@($targets | Where-Object {[IO.Path]::GetDirectoryName($_.path) -ceq $directory.path} |
        ForEach-Object {[IO.Path]::GetFileName($_.path)})
    [Array]::Sort($expected,[StringComparer]::Ordinal)
    if(($expected -join '|') -cne ($directory.children -join '|')){throw 'S1B_INVENTORY_CHANGED'}
}
$tools=@()
$users=@()
$members=@()
$rules=@()
if(!$Fixture){
    foreach($role in @(@('codex',$CodexPath),@('claude',$ClaudePath))){
        $path=$role[1]
        [void](Get-DyeProbePath $path)
        if([IO.Path]::GetExtension($path) -cne '.exe' -or [IO.Path]::GetFileNameWithoutExtension($path) -cne $role[0]){
            throw 'INVENTORY_EXECUTABLE'
        }
        $tools+=[ordered]@{role=$role[0];path=$path;sha256=(Get-DyeProbeHash $path)}
    }
    $members=@(Get-LocalGroupMember -Group 'CodexSandboxUsers' | ForEach-Object {$_.SID.Value} | Sort-Object)
    $users=@(Get-LocalUser | Where-Object {$_.SID.Value -match '-100[34]$'} |
        ForEach-Object {[ordered]@{sid=$_.SID.Value;enabled=$_.Enabled}})
    foreach($filter in @(Get-NetFirewallSecurityFilter | Where-Object {$_.LocalUser -match '-100[34](?![0-9])'})){
        $rules+=@(Get-NetFirewallRule -AssociatedNetFirewallSecurityFilter $filter |
            Select-Object Name,Direction,Action,Enabled)
    }
}
$result=[ordered]@{schema=1;mode=$(if($Fixture){'fixture'}else{'operator'});owner=$manifest.owner;deny=$manifest.deny;
    evidenceRoot=(Get-DyeAreaTuple $EvidenceRoot);stage1bInventory=$inventory;journalHash=$JournalHash;
    tools=$tools;users=$users;members=$members;firewall=$rules}
$path=Join-Path $out ('stage2-inventory-'+[guid]::NewGuid().ToString('N')+'.json')
$bytes=$utf8.GetBytes((ConvertTo-Json $result -Depth 14 -Compress))
$file=New-Object IO.FileStream($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
try{$file.Write($bytes,0,$bytes.Length);$file.Flush($true)}finally{$file.Dispose()}
ConvertTo-Json @{path=$path;inventoryHash=(Digest $bytes)} -Compress
