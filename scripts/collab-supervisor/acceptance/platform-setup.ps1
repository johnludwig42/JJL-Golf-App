param(
    [ValidateSet('Plan','Apply','Verify','Restore')][string]$Action='Plan',
    [string]$SourcePath,[string]$EntryHash,[string]$BundleHash,[string]$ManifestHash,
    [string]$PowerShellHash,[string]$GitHash,[string]$EvidenceRoot,[string]$PlanFile,[string]$ApplyId
)
$ErrorActionPreference='Stop'
# Argument refusals precede profile/setup-path resolution and native loading.
if($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1){throw 'RUNTIME: Windows PowerShell 5.1 required'}
if(!$SourcePath -or $EntryHash -cnotmatch '^[a-f0-9]{64}$'){throw 'NOT_APPROVED: captured entry bytes and source path required'}
if($BundleHash -cnotmatch '^[a-f0-9]{64}$'){throw 'NOT_APPROVED: reviewed setup bundle required for every action'}
if($Action -ne 'Plan' -and (@($BundleHash,$ManifestHash,$PowerShellHash,$GitHash) | Where-Object {$_ -cnotmatch '^[a-f0-9]{64}$'}).Count){throw 'NOT_APPROVED: exact reviewed hashes required'}
if($Action -ne 'Plan' -and (!$PlanFile -or ($Action -in @('Verify','Restore') -and $ApplyId -cnotmatch '^[a-f0-9]{32}$'))){throw 'NOT_APPROVED: plan and apply identity required'}
if($Action -in @('Apply','Restore') -and [Console]::IsInputRedirected){throw 'NOT_APPROVED: interactive operator required'}
# Captured text must not rely on $PSScriptRoot or the caller's working directory.
if($SourcePath -cnotmatch '\\scripts\\collab-supervisor\\acceptance\\platform-setup\.ps1$'){throw 'SOURCE: unexpected entry location'}
$repo=$SourcePath.Substring(0,$SourcePath.Length-'\scripts\collab-supervisor\acceptance\platform-setup.ps1'.Length)
$library=[IO.Path]::Combine($repo,'scripts\collab-supervisor\lib\setup-acl.ps1')
$utf8=[Text.UTF8Encoding]::new($false,$true)
$entryBytes=[IO.File]::ReadAllBytes($SourcePath)
$sha=[Security.Cryptography.SHA256]::Create()
try{$actualEntry=([BitConverter]::ToString($sha.ComputeHash($entryBytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
if($actualEntry -cne $EntryHash){throw 'SOURCE: changed entry bytes'}
$libraryBytes=[IO.File]::ReadAllBytes($library)
$sha=[Security.Cryptography.SHA256]::Create()
try {
    $libraryHash=([BitConverter]::ToString($sha.ComputeHash($libraryBytes))).Replace('-','').ToLowerInvariant()
    $bundleBytes=$utf8.GetBytes("platform-setup.ps1 $actualEntry`nlib/setup-acl.ps1 $libraryHash`n")
    $actualBundle=([BitConverter]::ToString($sha.ComputeHash($bundleBytes))).Replace('-','').ToLowerInvariant()
} finally {$sha.Dispose()}
if($BundleHash -cne $actualBundle){throw 'NOT_APPROVED: changed setup dependency'}
if('DyeB0.Native' -as [type]){throw 'NATIVE_PRELOADED: start a fresh no-profile Windows PowerShell process'}
# The library defines functions only. Native loading and real-path work follow
# bundle checks. Execute the captured bytes, never a second dot-source read.
. ([ScriptBlock]::Create($utf8.GetString($libraryBytes)))
if(!$EvidenceRoot){throw 'PATH: evidence root required'}
Assert-B0Path $SourcePath;Assert-B0Path $library;Assert-B0Path $repo;Assert-B0Path $EvidenceRoot
foreach($denied in @($repo,$env:TEMP,$env:USERPROFILE)){if(Test-B0Within $denied $EvidenceRoot){throw 'PATH: evidence root under prohibited location'}}
Initialize-B0Native
if([DyeB0.Native]::Elevated()){throw 'OPERATOR: non-elevated token required'}
$owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$systemPs=[IO.Path]::Combine([Environment]::SystemDirectory,'WindowsPowerShell\v1.0\powershell.exe')
Assert-B0Path $systemPs
$actualPs=Get-B0Hash ([IO.File]::ReadAllBytes($systemPs))
$git=(Get-Command git.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
Assert-B0Path $git
$gitMeta=[DyeB0.Native]::InspectRuntime($git)
if($gitMeta.Links -ne 1) {
    if([IO.Path]::GetFileName([IO.Path]::GetDirectoryName($git)) -ine 'cmd'){throw 'RUNTIME: single-link Git required'}
    $candidate=[IO.Path]::Combine([IO.Path]::GetDirectoryName([IO.Path]::GetDirectoryName($git)),'bin\git.exe')
    $candidateMeta=Get-B0Snapshot $candidate
    if($candidateMeta.Links -ne 1 -or (Get-B0Hash ([IO.File]::ReadAllBytes($candidate))) -cne (Get-B0Hash ([IO.File]::ReadAllBytes($git)))){throw 'RUNTIME: no identical single-link Git'}
    $git=$candidate
}
$actualGit=Get-B0Hash ([IO.File]::ReadAllBytes($git))
if($PowerShellHash -and $actualPs -cne $PowerShellHash){throw 'NOT_APPROVED: changed PowerShell'}
if($GitHash -and $actualGit -cne $GitHash){throw 'NOT_APPROVED: changed Git'}
$top=& $git -c core.fsmonitor=false -c core.hooksPath=NUL -C $repo rev-parse --show-toplevel
if($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($top) -ine $repo){throw 'REPOSITORY: unexpected top level'}
& $git -c core.fsmonitor=false -c core.hooksPath=NUL -C $repo check-ignore --quiet -- .env.wp-auto-sentinel
if($LASTEXITCODE -ne 0){throw 'REPOSITORY: sentinel must be ignored'}
$output=[IO.Path]::Combine($EvidenceRoot,'WP-AUTO-02');Assert-B0Path $output
$deny=([Security.Principal.NTAccount]::new($env:COMPUTERNAME,'CodexSandboxUsers')).Translate([Security.Principal.SecurityIdentifier]).Value
Assert-B0Token $deny ([DyeB0.Native]::TokenSids())
$members=Get-B0Membership 'CodexSandboxUsers' $owner
$sddl=Get-B0Descriptor $owner $deny
if(![DyeB0.Native]::HasFullAccess($sddl)){throw 'OPERATOR_BLOCKED: proposed DACL'}
if($Action -eq 'Plan') {
    $supabase=[IO.Path]::Combine($env:USERPROFILE,'.supabase');if(!(Test-B0Exists $supabase)){$supabase=$null}
    $manifest=[ordered]@{schema=1;planId=[guid]::NewGuid().ToString('N');repo=$repo;evidenceRoot=$EvidenceRoot;control=[IO.Path]::Combine($EvidenceRoot,'_supervisor');profileClaude=[IO.Path]::Combine($env:USERPROFILE,'.claude');profileCodex=[IO.Path]::Combine($env:USERPROFILE,'.codex');profileSupabase=$supabase;temp=$env:TEMP;owner=$owner;deny=$deny;members=$members;sddl=$sddl;entryHash=$actualEntry;libraryHash=$libraryHash;bundleHash=$actualBundle;powershell=$systemPs;powershellHash=$actualPs;git=$git;gitHash=$actualGit;sentinelBytes=52;targets=@();parents=@()}
    $manifest.targets=Get-B0Targets $manifest;$manifest.parents=Get-B0Parents $manifest
    Assert-B0Path $manifest.control -MissingLeaf
    if(Test-B0Exists $manifest.control){throw 'EXISTS: control area'}
    foreach($target in $manifest.targets){if($target.name -ne 'S6'){Assert-B0Path $target.path -MissingLeaf};if(Test-B0Exists $target.path){throw 'EXISTS: sentinel'}}
    $digest=Get-B0ManifestDigest $manifest
    $path=[IO.Path]::Combine($output,'stage1b-plan-'+$manifest.planId+'.json')
    Write-B0Exclusive $path (Get-B0TextBytes (ConvertTo-B0Json ([ordered]@{manifestHash=$digest;manifest=$manifest})))
    [ordered]@{action='Plan';applied=$false;path=$path;manifestHash=$digest;bundleHash=$actualBundle;entryHash=$actualEntry;libraryHash=$libraryHash;powershellHash=$actualPs;gitHash=$actualGit;realResults='UNVERIFIED'} | ConvertTo-Json -Compress
    return
}
Assert-B0Path $PlanFile
if([IO.Path]::GetDirectoryName($PlanFile) -ine $output){throw 'PLAN: wrong evidence folder'}
$record=Read-B0Json $PlanFile;$manifest=$record.manifest
if($record.manifestHash -cne $ManifestHash -or (Get-B0ManifestDigest $manifest) -cne $ManifestHash){throw 'NOT_APPROVED: changed plan'}
try {
foreach($pair in @(@($manifest.bundleHash,$actualBundle),@($manifest.powershellHash,$actualPs),@($manifest.gitHash,$actualGit),@($manifest.repo,$repo),@($manifest.evidenceRoot,$EvidenceRoot),@($manifest.owner,$owner),@($manifest.deny,$deny),@($manifest.sddl,$sddl),@($manifest.git,$git),@($manifest.powershell,$systemPs))) {if($pair[0] -cne $pair[1]){throw 'NOT_APPROVED: changed plan dependency'}}
if((ConvertTo-B0Json $members) -cne (ConvertTo-B0Json $manifest.members)){
    if($Action -eq 'Restore'){throw 'MEMBERSHIP_DRIFT: reviewed recovery decision required'}
    throw 'MEMBERSHIP_DRIFT: new Plan required'
}
Assert-B0TargetSet $manifest
if($Action -eq 'Restore'){Assert-B0Parents $manifest -AllowPermissionDrift}else{Assert-B0Parents $manifest}
if($Action -eq 'Apply') {
    foreach($prior in [IO.Directory]::EnumerateFiles($output,'stage1b-journal-*.jsonl')){
        $priorJournal=Read-B0Journal $prior
        if($priorJournal.torn -or !@($priorJournal.rows | Where-Object {$_.event -eq 'verified'}).Count){
            $starts=@($priorJournal.rows | Where-Object {$_.event -eq 'start'})
            $restored=$false
            if($starts.Count -eq 1 -and $starts[0].applyId -cmatch '^[a-f0-9]{32}$') {
                $recoveryPath=[IO.Path]::Combine($output,'stage1b-restore-'+$starts[0].applyId+'.jsonl')
                if(Test-B0Exists $recoveryPath){$recovery=Read-B0Journal $recoveryPath;$restored=!$recovery.torn -and @($recovery.rows | Where-Object {$_.event -eq 'restored' -and $_.applyId -ceq $starts[0].applyId}).Count -eq 1}
            }
            if(!$restored){throw 'UNFINISHED: retain journal and review recovery'}
        }
    }
    $ApplyId=[guid]::NewGuid().ToString('N')
    if((Read-Host ('Type APPLY B0 '+$ManifestHash.Substring(0,8))) -cne ('APPLY B0 '+$ManifestHash.Substring(0,8))){throw 'NOT_APPROVED: confirmation refused'}
}
$journal=[IO.Path]::Combine($output,'stage1b-journal-'+$ApplyId+'.jsonl')
if($Action -eq 'Apply'){$result=Invoke-B0ApplyCore $manifest $ApplyId $journal}
else {
    $j=Read-B0Journal $journal;$start=@($j.rows | Where-Object {$_.event -eq 'start'})
    if($start.Count -ne 1 -or $start[0].manifestHash -cne $ManifestHash -or $start[0].applyId -cne $ApplyId){throw 'JOURNAL_DAMAGED: wrong apply binding'}
    if($Action -eq 'Verify'){$result=Get-B0VerificationCore $manifest $ApplyId $journal}
    else {
        if((Read-Host ('Type RESTORE B0 '+$ApplyId.Substring(0,8))) -cne ('RESTORE B0 '+$ApplyId.Substring(0,8))){throw 'NOT_APPROVED: confirmation refused'}
        $restoreJournal=[IO.Path]::Combine($output,'stage1b-restore-'+$ApplyId+'.jsonl')
        $result=Invoke-B0RestoreCore $manifest $ApplyId $journal $restoreJournal
    }
}
$resultPath=[IO.Path]::Combine($output,('stage1b-'+$Action.ToLowerInvariant()+'-'+$ApplyId+'-'+[guid]::NewGuid().ToString('N')+'.json'))
Write-B0Exclusive $resultPath (Get-B0TextBytes (ConvertTo-B0Json $result))
[ordered]@{action=$Action;applyId=$ApplyId;result=$result.result;evidence=$resultPath;realResults='UNVERIFIED'} | ConvertTo-Json -Compress
} catch {
    $actionError=$_
    if($ApplyId -cmatch '^[a-f0-9]{32}$') {
        $failureJournal=[IO.Path]::Combine($output,'stage1b-journal-'+$ApplyId+'.jsonl')
        try {
            $failurePath=Write-B0FailureRecord $manifest $ApplyId $failureJournal $Action $actionError
            if($failurePath){Write-Warning ('Failure evidence: '+$failurePath)}
        } catch {Write-Error -Message 'FAILURE_EVIDENCE_WRITE_FAILED: original action also failed; retain its journal' -ErrorAction Continue}
    }
    throw $actionError
}
