param(
    [Parameter(Mandatory=$true)][ValidateSet('Plan','Provision','Verify')][string]$Action,
    [Parameter(Mandatory=$true)][string]$SourcePath,
    [Parameter(Mandatory=$true)][string]$EntryHash,
    [Parameter(Mandatory=$true)][string]$BundleHash,
    [Parameter(Mandatory=$true)][string]$EvidenceRoot,
    [string]$InventoryPath,[string]$InventoryHash,
    [string]$PlanPath,[string]$PlanHash,
    [string]$ApprovalPath,[string]$ApprovalHash,
    [string]$BindingPath,[string]$BindingHash,
    [switch]$Fixture,
    [ValidateRange(-1,8)][int]$FixtureFaultAfter=-1
)
$ErrorActionPreference='Stop'
if($FixtureFaultAfter -ge 0 -and (!$Fixture -or $env:DYE_SETUP_TEST -cne '1')){throw 'AREA_FIXTURE_REQUIRED'}
if($PSVersionTable.PSVersion.ToString() -notmatch '^5\.1\.' -or
   $SourcePath -cnotmatch '\\scripts\\collab-supervisor\\acceptance\\stage2-area\.ps1$'){throw 'AREA_RUNTIME'}
$utf8=New-Object Text.UTF8Encoding($false,$true)
function Digest([byte[]]$Bytes){
    $sha=[Security.Cryptography.SHA256]::Create()
    try{return [BitConverter]::ToString($sha.ComputeHash($Bytes)).Replace('-','')}
    finally{$sha.Dispose()}
}
function ReadPinned([string]$Path,[string]$Hash){
    if($Hash -cnotmatch '^[A-F0-9]{64}$'){throw 'AREA_APPROVAL_REQUIRED'}
    $bytes=[IO.File]::ReadAllBytes($Path)
    if($bytes.Length -gt 131072 -or (Digest $bytes) -cne $Hash){throw 'AREA_HASH_MISMATCH'}
    return $utf8.GetString($bytes)
}
function WriteExclusive([string]$Path,[string]$Text){
    $stream=New-Object IO.FileStream($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
    try{$bytes=$utf8.GetBytes($Text);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}
    finally{$stream.Dispose()}
}
[void](ReadPinned $SourcePath $EntryHash)
$lib=Join-Path (Split-Path (Split-Path $SourcePath)) 'lib'
$transport=$utf8.GetString([IO.File]::ReadAllBytes((Join-Path $lib 'probe-transport.ps1')))
$areaCode=$utf8.GetString([IO.File]::ReadAllBytes((Join-Path $lib 'stage2-area.ps1')))
$bundle="stage2-area.ps1 $EntryHash`nprobe-transport.ps1 $(Digest ($utf8.GetBytes($transport)))`nstage2-area-lib.ps1 $(Digest ($utf8.GetBytes($areaCode)))`n"
if((Digest ($utf8.GetBytes($bundle))) -cne $BundleHash){throw 'AREA_BUNDLE_MISMATCH'}
. ([scriptblock]::Create($transport))
. ([scriptblock]::Create($areaCode))
[void](Get-DyeProbePath $EvidenceRoot)
if($Fixture){
    $temp=[IO.Path]::GetTempPath().TrimEnd('\')+'\'
    if($env:DYE_SETUP_TEST -cne '1' -or !$EvidenceRoot.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -or
       $EvidenceRoot -cnotmatch '\\dye-stage2-area-[^\\]+\\'){throw 'AREA_FIXTURE_REQUIRED'}
}elseif($EvidenceRoot -cne 'C:\Projects\dye-ledger-evidence'){throw 'AREA_RECORD'}
$area=Join-Path $EvidenceRoot '_stage2'
$out=Join-Path $EvidenceRoot 'WP-AUTO-02'
[void](Get-DyeProbePath $out)
function ReadOrdinary([string]$Path,[string]$Hash){
    if([IO.Path]::GetDirectoryName($Path) -cne $out){throw 'AREA_RECORD_LOCATION'}
    [void](Get-DyeProbePath $Path)
    return ReadPinned $Path $Hash | ConvertFrom-Json
}
if($Action -ceq 'Verify'){
    $binding=ReadOrdinary $BindingPath $BindingHash
    if($binding.area_path -cne $area -or $binding.run_class -cne $(if($Fixture){'live-test'}else{'live-real'})){throw 'AREA_RECORD'}
    $map=@{}
    foreach($property in $binding.PSObject.Properties){$map[$property.Name]=$property.Value}
    Assert-DyeStage2Area $map
    $path=Join-Path $out ('stage2-area-verify-'+[guid]::NewGuid().ToString('N')+'.json')
    WriteExclusive $path (ConvertTo-Json @{result='PASS';bindingHash=$BindingHash} -Compress)
    return
}
if(Test-Path -LiteralPath $area){throw 'AREA_EXISTS'}
$inventory=ReadOrdinary $InventoryPath $InventoryHash
$owner=[Security.Principal.WindowsIdentity]::GetCurrent()
try{
    if($owner.User.Value -cne $inventory.owner -or $inventory.deny -cnotmatch '^S-[0-9-]+$' -or
       $inventory.deny -ceq $inventory.owner -or @($owner.Groups | Where-Object Value -ceq $inventory.deny).Count){throw 'AREA_TOKEN'}
    if($Fixture -and $inventory.deny -cne 'S-1-5-7'){throw 'AREA_FIXTURE_SID'}
    if(!$Fixture){
        $expected=([Security.Principal.NTAccount]::new($env:COMPUTERNAME,'CodexSandboxUsers')).Translate([Security.Principal.SecurityIdentifier]).Value
        if($inventory.deny -cne $expected){throw 'AREA_TOKEN'}
    }
}finally{$owner.Dispose()}
$root=Get-DyeAreaTuple $EvidenceRoot
if($root.id -cne $inventory.evidenceRoot.id -or $root.volume -cne $inventory.evidenceRoot.volume -or
   $root.sddl -cne $inventory.evidenceRoot.sddl){throw 'AREA_PARENT_CHANGED'}
Assert-DyeStage1bInventory $inventory.stage1bInventory $EvidenceRoot -Fixture:$Fixture
$sid=$inventory.owner
$deny=$inventory.deny
$descriptor="O:${sid}G:${sid}D:P(D;OICI;FA;;;${deny})(A;OICI;FA;;;${sid})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)"
if(![DyeStage2.AreaHandle]::HasFullAccess($descriptor)){throw 'AREA_TOKEN'}
$plan=[ordered]@{schema=1;area=$area;owner=$sid;deny=$deny;sddl=$descriptor;
    inventoryHash=$InventoryHash;entryHash=$EntryHash;bundleHash=$BundleHash}
$planText=ConvertTo-Json $plan -Compress
if($Action -ceq 'Plan'){
    $path=Join-Path $out ('stage2-area-plan-'+[guid]::NewGuid().ToString('N')+'.json')
    WriteExclusive $path $planText
    ConvertTo-Json @{path=$path;planHash=(Digest ($utf8.GetBytes($planText)))} -Compress
    return
}
[void](Get-DyeProbePath $PlanPath)
if([IO.Path]::GetDirectoryName($PlanPath) -cne $out -or (ReadPinned $PlanPath $PlanHash) -cne $planText){throw 'AREA_PLAN_CHANGED'}
$approval=ReadOrdinary $ApprovalPath $ApprovalHash
if($approval.kind -cne 'S2-P' -or $approval.planHash -cne $PlanHash -or $approval.bundleHash -cne $BundleHash -or
   $approval.area -cne $area){throw 'AREA_APPROVAL_REQUIRED'}
if(!$Fixture -and [Console]::IsInputRedirected){throw 'AREA_OPERATOR_REQUIRED'}
if((Read-Host 'Confirm the reviewed Stage 2 area') -cne ('PROVISION STAGE2 '+$PlanHash.Substring(0,8))){throw 'AREA_CONFIRMATION'}
$id=[guid]::NewGuid().ToString('N')
$journal=Join-Path $out ('stage2-area-journal-'+$id+'.jsonl')
$stream=New-Object IO.FileStream($journal,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
$state=@{previous='0'*64;seq=0}
function Record([string]$Phase,[string]$Path){
    $record=[ordered]@{seq=$state.seq;previous=$state.previous;phase=$Phase;path=$Path}
    $state.previous=Digest ($utf8.GetBytes((ConvertTo-Json $record -Compress)))
    $state.seq++
    $line=(ConvertTo-Json ([ordered]@{record=$record;hash=$state.previous}) -Compress)+"`n"
    $bytes=$utf8.GetBytes($line)
    $stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)
    if($FixtureFaultAfter -ge 0 -and $state.seq -eq ($FixtureFaultAfter+1)){throw 'AREA_FIXTURE_INTERRUPTION'}
}
try{
    Record 'intent' $area
    [DyeStage2.AreaHandle]::ProvisionDirectory($area,$descriptor)
    Record 'done' $area
    $approvals=Join-Path $area 'approvals'
    $runs=Join-Path $area 'runs'
    foreach($path in @($approvals,$runs)){
        Record 'intent' $path
        [DyeStage2.AreaHandle]::ProvisionDirectory($path,'')
        Record 'done' $path
    }
    $recordPath=Join-Path $area 'area.json'
    Record 'intent' $recordPath
    $file=New-Object IO.FileStream($recordPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read
    )
    try {
        $runsTuple=Get-DyeAreaTuple $runs
        $record=[ordered]@{schema=1;provisionId=$id;path=$area;owner=$sid;deny=$deny;root=(Get-DyeAreaTuple $area);
            approvals=(Get-DyeAreaTuple $approvals);runs=$runsTuple;runSddl=$runsTuple.sddl;
            recordSddl=(Get-DyeAreaTuple $recordPath $false).sddl;stage1bInventory=$inventory.stage1bInventory;
            planHash=$PlanHash;approvalHash=$ApprovalHash;createdUtc=[DateTime]::UtcNow.ToString('o')}
        $text=ConvertTo-Json $record -Depth 12 -Compress
        $bytes=$utf8.GetBytes($text);$file.Write($bytes,0,$bytes.Length);$file.Flush($true)
    }finally{$file.Dispose()}
    Record 'done' $recordPath
    Assert-DyeStage1bInventory $inventory.stage1bInventory $EvidenceRoot -Fixture:$Fixture
    $receipt=Join-Path $out ('stage2-area-'+$id+'.json')
    if($FixtureFaultAfter -eq 8){throw 'AREA_FIXTURE_INTERRUPTION'}
    WriteExclusive $receipt (ConvertTo-Json @{record=$record;areaRecordHash=(Digest $bytes)} -Depth 14 -Compress)
}catch{
    $failure=Join-Path $out ('stage2-area-'+$id+'-failed.json')
    WriteExclusive $failure (ConvertTo-Json @{result='FAILED';journal=$journal;lastHash=$state.previous;error=$_.Exception.Message} -Compress)
    throw
}finally{$stream.Dispose()}
