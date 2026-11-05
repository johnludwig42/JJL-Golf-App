import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { INVENTORY_TEMPLATES, inventoryRegistryHash } from '../lib/probe-contract.js';
import { inventoryTransportBundleHash } from '../lib/live-probes.js';

// Owner-approved A12 exception: only this disposable helper duplicates a pipe, never a job handle.
const pipeHelper = String.raw`$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FixturePipeTransfer {
 [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int number);
 [DllImport("kernel32.dll")] static extern uint GetFileType(IntPtr handle);
 [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll")] static extern bool GetProcessTimes(IntPtr process,out long created,out long exited,out long kernel,out long user);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool DuplicateHandle(IntPtr source,IntPtr handle,IntPtr target,out IntPtr copy,uint access,bool inherit,uint options);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 public static long Transfer(int pid,long created) {
  IntPtr pipe=GetStdHandle(-11),target=IntPtr.Zero,copy;
  if(GetFileType(pipe)!=3)throw new Exception("FIXTURE_NOT_PIPE");
  try {
   target=OpenProcess(0x1040,false,pid);
   long c,e,k,u;
   if(target==IntPtr.Zero||!GetProcessTimes(target,out c,out e,out k,out u)||c!=created)
    throw new Exception("FIXTURE_TARGET_IDENTITY");
   if(!DuplicateHandle(GetCurrentProcess(),pipe,target,out copy,0,false,2))
    throw new Exception("FIXTURE_PIPE_TRANSFER");
   return copy.ToInt64();
  } finally {if(target!=IntPtr.Zero)CloseHandle(target);}
 }
}
'@
$target=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'fixture-pipe-target.json') -Raw | ConvertFrom-Json
$process=[Diagnostics.Process]::GetProcessById([int]$target.pid)
if($process.MainModule.FileName -ine (Join-Path $PSHOME 'powershell.exe')){throw 'FIXTURE_TARGET_IMAGE'}
$copy=[FixturePipeTransfer]::Transfer([int]$target.pid,[long]$target.created)
$receipt=@{pid=$target.pid;created=$target.created;handle=$copy.ToString();helper=$PID}
$bytes=[Text.Encoding]::UTF8.GetBytes(($receipt|ConvertTo-Json -Compress))
$file=[IO.File]::Open((Join-Path $PSScriptRoot 'fixture-pipe-receipt.json'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
try{$file.Write($bytes,0,$bytes.Length);$file.Flush($true)}finally{$file.Dispose()}
`;

const enabled = process.platform === 'win32' && process.env.DYE_SETUP_TEST === '1';
const quote = value => "'" + value.replaceAll("'", "''") + "'";

test('inventory observation orchestration uses only synthetic providers and fails closed on a missing observation', { skip: !enabled }, () => {
  const root = mkdtempSync(join(tmpdir(), 'dye-stage2-observation-route-'));
  const script = join(root, 'route.ps1');
  writeFileSync(script, `
$ErrorActionPreference='Stop'
. ${quote(resolve('scripts/collab-supervisor/lib/probe-transport.ps1'))}
$approval=Join-Path ${quote(root)} 'approval.json'
$scope=@{installFolders=@{codex='C:\\FIXTURE'};pathDirectories=@('C:\\FIXTURE');metadataPaths=@('C:\\FIXTURE');
    profileFolders=@('C:\\PROFILE');sandboxSids=@('S-1-5-21-1-2-3-1003','S-1-5-21-1-2-3-1004')}
[IO.File]::WriteAllText($approval,(ConvertTo-Json @{inventory=@{observation=$scope;tools=@{codex=@{path='C:\\FIXTURE\\CODEX.EXE'};claude=@{path='C:\\FIXTURE\\CLAUDE.EXE'}}}} -Depth 8))
function Get-DyeInventoryFileObservation {param($ToolPath,$InstallFolder,$ProfileFolders) @{image=@{path=$ToolPath};install=@();profiles=@()}}
function Get-DyeInventoryResolution {param($Role,$Directories) @{path='C:\\FIXTURE\\CODEX.EXE'}}
function Get-DyeInventoryPathObservation {param($Paths) @{path=$Paths[0];id='fixture-id'}}
function Get-DyeInventorySystemObservation {param($ToolPaths) @{users=@();groups=@();sandboxMembers=$scope.sandboxSids;firewall=@()}}
function Get-DyeInventoryProcessObservation {param($OwnerSids) @{Status='OK';Processes=@()}}
$binding=@{run_class='live-real';probe_id='c-v';target_executable='C:\\FIXTURE\\CODEX.EXE';approval_path=$approval;approval_hash=(Get-DyeProbeHash $approval)}
$result=Get-DyeInventoryRunObservation $binding
if($result.status -cne 'OK' -or !$result.observedFiletime -or $result.paths.Count -ne 1){throw 'Composite observation missing'}
function Get-DyeInventoryProcessObservation {param($OwnerSids) @{Status='INCOMPLETE';Processes=@()}}
$result=Get-DyeInventoryRunObservation $binding
if($result.status -cne 'INCOMPLETE' -or $result.error -cne 'OBSERVATION_INCOMPLETE'){throw 'Missing process observation accepted'}
$binding.approval_hash='A'*64
$result=Get-DyeInventoryRunObservation $binding
if($result.status -cne 'INCOMPLETE' -or $result.files){throw 'Unbound approval inspected'}
Write-Output 'PASS'
`, 'utf8');
  const output = execFileSync(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { encoding: 'utf8', timeout: 15000 });
  assert.match(output, /PASS/);
});

test('inventory system observation selects SID and application rules using synthetic providers', { skip: !enabled }, () => {
  const root = mkdtempSync(join(tmpdir(), 'dye-stage2-system-'));
  const script = join(root, 'system.ps1');
  writeFileSync(script, `
$ErrorActionPreference='Stop'
. ${quote(resolve('scripts/collab-supervisor/lib/probe-transport.ps1'))}
function Get-LocalUser {param($ErrorAction) [pscustomobject]@{Name='fixture';SID=@{Value='S-1-5-21-1003'};Enabled=$true}}
function Get-LocalGroup {param($ErrorAction) [pscustomobject]@{Name='fixture-group';SID=@{Value='S-1-5-21-2000'}}}
function Get-LocalGroupMember {param($Group,$ErrorAction) [pscustomobject]@{SID=@{Value='S-1-5-21-1003'}}}
function Get-NetFirewallSecurityFilter {
    param($AssociatedNetFirewallRule,$ErrorAction)
    [pscustomobject]@{Name='sid-rule';LocalUser='S-1-5-21-1003'}
    [pscustomobject]@{Name='irrelevant';LocalUser='S-1-5-21-10030'}
}
function Get-NetFirewallApplicationFilter {
    param($AssociatedNetFirewallRule,$ErrorAction)
    [pscustomobject]@{Name='app-rule';Program='C:\\fixture\\tool.exe'}
    [pscustomobject]@{Name='unrelated';Program='C:\\fixture\\other.exe'}
}
function Get-NetFirewallRule {
    param($AssociatedNetFirewallSecurityFilter,$AssociatedNetFirewallApplicationFilter,$ErrorAction)
    $name=if($AssociatedNetFirewallSecurityFilter){$AssociatedNetFirewallSecurityFilter.Name}else{$AssociatedNetFirewallApplicationFilter.Name}
    [pscustomobject]@{Name=$name;Enabled='True';Direction='Outbound';Action='Block';Profile='Any'}
}
function Get-NetFirewallPortFilter {param($AssociatedNetFirewallRule,$ErrorAction) [pscustomobject]@{Protocol='TCP';RemotePort='443'}}
function Get-NetFirewallAddressFilter {param($AssociatedNetFirewallRule,$ErrorAction) [pscustomobject]@{RemoteAddress='Any'}}
$result=Get-DyeInventorySystemObservation @('C:\\fixture\\tool.exe')
if(($result.firewall.name -join '|') -cne 'app-rule|sid-rule' -or $result.users.Count -ne 1 -or
   $result.groups.Count -ne 1 -or $result.sandboxMembers.Count -ne 1){throw 'Observation selection mismatch'}
function Get-LocalGroupMember {param($Group,$ErrorAction) throw 'fixture access denied'}
try {Get-DyeInventorySystemObservation @('C:\\fixture\\tool.exe');throw 'Expected failure'}
catch {if($_.ToString() -notmatch 'fixture access denied'){throw}}
Write-Output 'PASS'
`, 'utf8');
  const output = execFileSync(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { encoding: 'utf8', timeout: 15000 });
  assert.match(output, /PASS/);
});

test('inventory filesystem observations detect install changes and restrict profiles to folder metadata', { skip: !enabled }, () => {
  const root = mkdtempSync(join(tmpdir(), 'dye-stage2-observe-'));
  const script = join(root, 'observe.ps1');
  writeFileSync(script, `
$ErrorActionPreference='Stop'
. ${quote(resolve('scripts/collab-supervisor/lib/probe-transport.ps1'))}
. ${quote(resolve('scripts/collab-supervisor/lib/stage2-area.ps1'))}
$root=${quote(root)}
$install=Join-Path $root 'install'
$profile=Join-Path $root 'profile'
[void][IO.Directory]::CreateDirectory($install)
[void][IO.Directory]::CreateDirectory($profile)
$tool=Join-Path $install 'fake-cli.mjs'
[IO.File]::Copy(${quote(resolve('tests/fixtures/collab-supervisor/fake-cli.mjs'))},$tool)
$metadata=@(Get-DyeInventoryPathObservation @($install,$tool))
if($metadata.Count -ne 2 -or !$metadata[0].owner -or !$metadata[1].id){throw 'Native path observations missing'}
$resolution=Get-DyeInventoryResolution 'codex' @($install)
if($resolution.path){throw 'Unexpected resolution'}
[IO.File]::Copy($tool,(Join-Path $install 'codex.exe'))
$resolution=Get-DyeInventoryResolution 'codex' @($install)
if($resolution.path -cne (Join-Path $install 'codex.exe').ToUpperInvariant()){throw 'Fixed resolution missing'}
[IO.File]::Delete((Join-Path $install 'codex.exe'))
$before=Get-DyeInventoryFileObservation $tool $install @($profile)
if($before.install.Count -ne 1 -or $before.image.links -ne 1 -or !$before.profiles[0].id){throw 'Missing observations'}
[IO.File]::WriteAllText((Join-Path $install 'added.txt'),'fixture')
$after=Get-DyeInventoryFileObservation $tool $install @($profile)
if($after.install.Count -ne 2){throw 'Install addition not observed'}
[IO.File]::WriteAllText((Join-Path $profile 'private.txt'),'PROFILE-CONTENT-MUST-NOT-APPEAR')
$view=Get-DyeInventoryFileObservation $tool $install @($profile) | ConvertTo-Json -Depth 8
if($view -match 'private.txt|PROFILE-CONTENT-MUST-NOT-APPEAR'){throw 'Profile contents escaped'}
try {Get-DyeInventoryFileObservation $tool $root @($profile);throw 'Expected refusal'}
catch {if($_.ToString() -notmatch 'INVENTORY_PROFILE_INSTALL_NOT_RUN'){throw}}
Write-Output 'PASS'
`, 'utf8');
  const output = execFileSync(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { encoding: 'utf8', timeout: 15000 });
  assert.match(output, /PASS/);
});

test('Stage 2 protected fixture and Stage 1b inventory remain independent', { skip: !enabled }, () => {
  const root = mkdtempSync(join(tmpdir(), 'dye-stage2-area-'));
  const frozen = 'scripts/collab-supervisor/lib/setup-acl.ps1';
  for (const path of [frozen, 'scripts/collab-supervisor/acceptance/platform-setup.ps1',
    'scripts/collab-supervisor/acceptance/platform-setup.test.js']) {
    const source = execFileSync('git', ['show', '7f8c4b9:' + path]);
    assert.deepEqual(Buffer.from(readFileSync(path, 'utf8').replaceAll('\r\n', '\n')), source, path);
  }
  const script = join(root, 'coexistence.ps1');
  writeFileSync(script, `
$ErrorActionPreference='Stop'
. ${quote(resolve(frozen))}
. ${quote(resolve('scripts/collab-supervisor/lib/probe-transport.ps1'))}
. ${quote(resolve('scripts/collab-supervisor/lib/stage2-area.ps1'))}
Initialize-B0Native
$root=${quote(root)}
$owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$deny='S-1-5-7'
function Fixture([string]$name){
    $base=Join-Path $root $name
    [void][IO.Directory]::CreateDirectory($base)
    $manifest=[ordered]@{schema=1;repo=(Join-Path $base 'repo');evidenceRoot=(Join-Path $base 'evidence');
        profileClaude=(Join-Path $base 'claude');profileCodex=(Join-Path $base 'codex');
        profileSupabase=(Join-Path $base 'supabase');temp=(Join-Path $base 'temp');owner=$owner;deny=$deny;
        sddl=(Get-B0Descriptor $owner $deny);targets=@();parents=@()}
    foreach($path in @($manifest.repo,$manifest.evidenceRoot,$manifest.profileClaude,$manifest.profileCodex,$manifest.profileSupabase,$manifest.temp)){
        [void][IO.Directory]::CreateDirectory($path)
    }
    [void][IO.Directory]::CreateDirectory((Join-Path $manifest.evidenceRoot 'WP-AUTO-02'))
    $manifest.control=Join-Path $manifest.evidenceRoot '_supervisor'
    $manifest.targets=Get-B0Targets $manifest
    $manifest.parents=Get-B0Parents $manifest
    return @{m=$manifest;id=[guid]::NewGuid().ToString('N');journal=(Join-Path $base 'apply.jsonl');restore=(Join-Path $base 'restore.jsonl')}
}
function Refuses([scriptblock]$action,[string]$pattern){
    try { & $action } catch { if($_.ToString() -match $pattern){return};throw }
    throw ('Expected '+$pattern)
}
$f=Fixture 'coexistence'
if((Invoke-B0ApplyCore $f.m $f.id $f.journal $null).result -cne 'PASS'){throw 'Fixture Apply failed'}
$area=Join-Path $f.m.evidenceRoot '_stage2'
Refuses { Assert-DyeStage2Area @{area_path=$area;run_class='live-test'} } 'AREA_MISSING'
$ordinary=Join-Path $f.m.evidenceRoot 'WP-AUTO-02'
$entry=${quote(resolve('scripts/collab-supervisor/acceptance/stage2-area.ps1'))}
$entryHash=Get-DyeProbeHash $entry
$transportHash=Get-DyeProbeHash ${quote(resolve('scripts/collab-supervisor/lib/probe-transport.ps1'))}
$areaHash=Get-DyeProbeHash ${quote(resolve('scripts/collab-supervisor/lib/stage2-area.ps1'))}
$bundleText=('stage2-area.ps1 '+$entryHash+[char]10+'probe-transport.ps1 '+$transportHash+[char]10+'stage2-area-lib.ps1 '+$areaHash+[char]10)
$bundleHash=(Get-B0Hash ([Text.Encoding]::UTF8.GetBytes($bundleText))).ToUpperInvariant()
$ps=Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'
$inventoryEntry=${quote(resolve('scripts/collab-supervisor/acceptance/stage2-inventory.ps1'))}
$inventoryEntryHash=Get-DyeProbeHash $inventoryEntry
$setupHash=Get-DyeProbeHash ${quote(resolve(frozen))}
$inventoryBundleText=('stage2-inventory.ps1 '+$inventoryEntryHash+[char]10+
    'probe-transport.ps1 '+$transportHash+[char]10+'stage2-area.ps1 '+$areaHash+[char]10+'setup-acl.ps1 '+$setupHash+[char]10)
$inventoryBundle=(Get-B0Hash ([Text.Encoding]::UTF8.GetBytes($inventoryBundleText))).ToUpperInvariant()
$inventoryJson=& $ps -NoProfile -ExecutionPolicy Bypass -File $inventoryEntry -SourcePath $inventoryEntry -EntryHash $inventoryEntryHash -BundleHash $inventoryBundle -EvidenceRoot $f.m.evidenceRoot -JournalPath $f.journal -JournalHash (Get-DyeProbeHash $f.journal) -Fixture
if($LASTEXITCODE -ne 0 -or (Test-Path -LiteralPath $area)){throw 'Fixture inventory did not stay read-only'}
$inventoryResult=$inventoryJson | ConvertFrom-Json
$inventoryPath=$inventoryResult.path
if((Get-DyeProbeHash $inventoryPath) -cne $inventoryResult.inventoryHash){throw 'Fixture inventory digest mismatch'}
if((Get-Content -LiteralPath $inventoryPath -Raw) -match 'WP-AUTO-02-SENTINEL-|"(Hash|hash)"'){throw 'Fixture inventory copied sentinel material'}
$common=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$entry,'-SourcePath',$entry,'-EntryHash',$entryHash,
    '-BundleHash',$bundleHash,'-EvidenceRoot',$f.m.evidenceRoot,'-InventoryPath',$inventoryPath,'-InventoryHash',(Get-DyeProbeHash $inventoryPath),'-Fixture')
$planText=& $ps @common -Action Plan
if($LASTEXITCODE -ne 0 -or (Test-Path -LiteralPath $area)){throw 'Fixture Plan did not stay read-only'}
$plan=$planText | ConvertFrom-Json
$provisionApproval=Join-Path $ordinary 'fixture-provision-approval.json'
Write-B0Exclusive $provisionApproval (Get-B0TextBytes (ConvertTo-B0Json @{kind='S2-P';area=$area;planHash=$plan.planHash;bundleHash=$bundleHash}))
$provisionArgs=@($common)+@('-Action','Provision','-PlanPath',$plan.path,'-PlanHash',$plan.planHash,'-ApprovalPath',$provisionApproval,'-ApprovalHash',(Get-DyeProbeHash $provisionApproval))
function ProvisionRefuses([string[]]$Arguments,[string]$Confirmation,[string]$Label){
    $priorPreference=$ErrorActionPreference
    try{
        $ErrorActionPreference='Continue'
        $Confirmation | & $ps @Arguments 2> (Join-Path $ordinary ('refused-'+$Label+'.stderr')) | Out-Null
        $code=$LASTEXITCODE
    }finally{$ErrorActionPreference=$priorPreference}
    if($code -eq 0 -or (Test-Path -LiteralPath $area)){throw ('Provision refusal failed: '+$Label)}
}
foreach($pin in @('-EntryHash','-BundleHash')){
    $changed=[string[]]$provisionArgs.Clone()
    $position=[Array]::IndexOf($changed,$pin)
    if($position -lt 0){throw 'Missing test pin'}
    $changed[$position+1]='C'*64
    ProvisionRefuses $changed ('PROVISION STAGE2 '+$plan.planHash.Substring(0,8)) $pin.Substring(1)
}
$changedPlan=Get-Content -LiteralPath $plan.path -Raw | ConvertFrom-Json
$changedPlan | Add-Member -NotePropertyName fixtureUnapprovedInput -NotePropertyValue 'changed'
$changedPlanPath=Join-Path $ordinary 'changed-plan.json'
[IO.File]::WriteAllText($changedPlanPath,($changedPlan | ConvertTo-Json -Depth 40),[Text.UTF8Encoding]::new($false))
$changed=[string[]]$provisionArgs.Clone();$changed[[Array]::IndexOf($changed,'-PlanPath')+1]=$changedPlanPath
ProvisionRefuses $changed ('PROVISION STAGE2 '+$plan.planHash.Substring(0,8)) 'plan-input'
ProvisionRefuses $provisionArgs 'NO' 'confirmation'
('PROVISION STAGE2 '+$plan.planHash.Substring(0,8)) | & $ps @common -Action Provision -PlanPath $plan.path -PlanHash $plan.planHash -ApprovalPath $provisionApproval -ApprovalHash (Get-DyeProbeHash $provisionApproval) | Out-Null
if($LASTEXITCODE -ne 0){throw 'Fixture Provision failed'}
$existingTuple=ConvertTo-B0Json (Get-DyeAreaTuple $area)
$existingRecordHash=Get-DyeProbeHash (Join-Path $area 'area.json')
$priorPreference=$ErrorActionPreference
try{
    $ErrorActionPreference='Continue'
    ('PROVISION STAGE2 '+$plan.planHash.Substring(0,8)) | & $ps @provisionArgs 2> (Join-Path $ordinary 'refused-existing.stderr') | Out-Null
    $existingExit=$LASTEXITCODE
}finally{$ErrorActionPreference=$priorPreference}
if($existingExit -eq 0 -or (ConvertTo-B0Json (Get-DyeAreaTuple $area)) -cne $existingTuple -or
    (Get-DyeProbeHash (Join-Path $area 'area.json')) -cne $existingRecordHash){throw 'Existing area was not preserved on refusal'}
$approvals=Join-Path $area 'approvals'
$runs=Join-Path $area 'runs'
$runId='dye-live-'+[guid]::NewGuid().ToString()
$run=Join-Path $runs ('stage2-'+$runId)
[DyeB0.Native]::MakeInheritedDirectory($run)
$approval=Join-Path $approvals 'fixture.json'
Write-B0Exclusive $approval (Get-B0TextBytes (ConvertTo-B0Json @{mode='live-nonmodel';run_class='live-test';operation='auth';run_id=$runId}))
$recordPath=Join-Path $area 'area.json'
$record=Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
$bindings=@{area_path=$area;run_class='live-test';area_record_hash=(Get-DyeProbeHash $recordPath);
    area_volume=$record.root.volume;area_file_id=$record.root.id;run_dir_file_id=(Get-DyeAreaTuple $run).id;
    run_id=$runId;cwd=$run.ToUpperInvariant();approval_path=$approval.ToUpperInvariant();approval_file_id=(Get-DyeAreaTuple $approval $false).id;approval_hash=(Get-DyeProbeHash $approval);operation='auth'}
Add-Type -TypeDefinition @'
public static class FixtureDirectoryAccess {
 [System.Runtime.InteropServices.DllImport("kernel32.dll",CharSet=System.Runtime.InteropServices.CharSet.Unicode,SetLastError=true)]
 static extern System.IntPtr CreateFileW(string path,uint access,uint share,System.IntPtr security,uint disposition,uint flags,System.IntPtr template);
 [System.Runtime.InteropServices.DllImport("kernel32.dll")]
 static extern bool CloseHandle(System.IntPtr handle);
 [System.Runtime.InteropServices.DllImport("kernel32.dll")]
 static extern uint GetFileType(System.IntPtr handle);
 public static void ClosePipe(long value) {
  var handle=new System.IntPtr(value);
  if(GetFileType(handle)!=3||!CloseHandle(handle))throw new System.Exception("Fixture pipe cleanup refused");
 }
 [System.Runtime.InteropServices.DllImport("kernel32.dll",CharSet=System.Runtime.InteropServices.CharSet.Unicode,SetLastError=true)]
 static extern uint GetShortPathNameW(string path,System.Text.StringBuilder buffer,uint size);
 public static int DeleteAccessError(string path) {
  var handle=CreateFileW(path,0x10000,7,System.IntPtr.Zero,3,0x02000000,System.IntPtr.Zero);
  if(handle==new System.IntPtr(-1))return System.Runtime.InteropServices.Marshal.GetLastWin32Error();
  CloseHandle(handle);return 0;
 }
 public static string ShortName(string path) {
  var buffer=new System.Text.StringBuilder(32768);
  uint length=GetShortPathNameW(path,buffer,(uint)buffer.Capacity);
  if(length==0||length>=buffer.Capacity)return null;
  return buffer.ToString();
 }
}
'@
$held=Assert-DyeStage2Area $bindings -Hold
try {
    if($held.Count -ne 7){throw 'Expected all area and completion-receipt handles'}
    foreach($heldPath in @($area,$runs,$run)) {
        Refuses {[IO.Directory]::Move($heldPath,($heldPath+'.moved'))} 'denied|sharing|used by another process'
        # Ask for delete access without setting disposition or deleting anything.
        # A sharing violation proves the held handle denies that capability.
        if([FixtureDirectoryAccess]::DeleteAccessError($heldPath) -ne 32){throw 'Held directory did not refuse delete access with a sharing violation'}
    }
    $parentBefore=Get-DyeAreaTuple $f.m.evidenceRoot
    $parentMoved=$f.m.evidenceRoot+'.parent-rename-test'
    $parentRename=@{attempted=$true;succeeded=$false;error=$null;volume=$parentBefore.volume;id=$parentBefore.id}
    try {
        [IO.Directory]::Move($f.m.evidenceRoot,$parentMoved)
        $parentRename.succeeded=$true
        $movedTuple=Get-DyeAreaTuple $parentMoved
        if($movedTuple.id -cne $parentBefore.id -or $movedTuple.volume -cne $parentBefore.volume){throw 'Parent identity changed'}
    } catch {
        if($parentRename.succeeded){throw}
        $parentRename.error=$_.Exception.GetType().FullName
    } finally {
        if($parentRename.succeeded){[IO.Directory]::Move($parentMoved,$f.m.evidenceRoot)}
        [IO.File]::WriteAllText((Join-Path $root 'parent-rename-observation.json'),(ConvertTo-Json $parentRename -Compress))
    }
    Refuses {[IO.File]::Move($approval,($approval+'.moved'))} 'denied|sharing|used by another process'
    Refuses {[IO.File]::WriteAllText($recordPath,'changed')} 'denied|sharing|used by another process'
}
finally { foreach($item in $held){$item.Dispose()} }
# Change only fixture record bytes to claim a deny SID present in this token.
# No permission is ever applied with that SID.
$receiptPath=Join-Path $ordinary ('stage2-area-'+$record.provisionId+'.json')
$recordOriginal=[IO.File]::ReadAllBytes($recordPath)
$receiptOriginal=[IO.File]::ReadAllBytes($receiptPath)
try {
    if(![DyeStage2.AreaHandle]::IsTokenMember('S-1-5-11')){throw 'Fixture token must contain Authenticated Users'}
    $tokenRecord=$record | ConvertTo-Json -Depth 40 | ConvertFrom-Json
    $tokenRecord.deny='S-1-5-11'
    [IO.File]::WriteAllText($recordPath,($tokenRecord | ConvertTo-Json -Depth 40),[Text.UTF8Encoding]::new($false))
    $tokenBinding=$bindings.Clone();$tokenBinding.area_record_hash=Get-DyeProbeHash $recordPath
    $tokenReceipt=[Text.Encoding]::UTF8.GetString($receiptOriginal) | ConvertFrom-Json
    $tokenReceipt.areaRecordHash=$tokenBinding.area_record_hash
    [IO.File]::WriteAllText($receiptPath,($tokenReceipt | ConvertTo-Json -Depth 40),[Text.UTF8Encoding]::new($false))
    Refuses {Assert-DyeStage2Area $tokenBinding} 'AREA_TOKEN'
    $tokenRecord.deny='S-1-5-8'
    [IO.File]::WriteAllText($recordPath,($tokenRecord | ConvertTo-Json -Depth 40),[Text.UTF8Encoding]::new($false))
    $tokenBinding.area_record_hash=Get-DyeProbeHash $recordPath
    $tokenReceipt.areaRecordHash=$tokenBinding.area_record_hash
    [IO.File]::WriteAllText($receiptPath,($tokenReceipt | ConvertTo-Json -Depth 40),[Text.UTF8Encoding]::new($false))
    Refuses {Assert-DyeStage2Area $tokenBinding} 'AREA_PERMISSIONS'
} finally {
    [IO.File]::WriteAllBytes($recordPath,$recordOriginal)
    [IO.File]::WriteAllBytes($receiptPath,$receiptOriginal)
}
Assert-DyeStage2Area $bindings
$missing=$bindings.Clone();$missing.area_path=Join-Path (Join-Path $root 'missing') '_stage2'
Refuses {Assert-DyeStage2Area $missing} 'AREA_MISSING'
if(Test-Path -LiteralPath $missing.area_path){throw 'Missing area was created'}
$caseSpelling=$bindings.Clone();$caseSpelling.area_path=$area.ToLowerInvariant()
if($caseSpelling.area_path -ceq $area){throw 'Case-spelling fixture did not change spelling'}
Refuses {Assert-DyeStage2Area $caseSpelling} 'AREA_RECORD'
$shortName=[FixtureDirectoryAccess]::ShortName($area)
$shortObservation=@{available=($shortName -and $shortName -cne $area);result='NOT_RUN';reason='No distinct 8.3 spelling available'}
if($shortObservation.available){
    $shortBinding=$bindings.Clone();$shortBinding.area_path=$shortName
    Refuses {Assert-DyeStage2Area $shortBinding} 'AREA_REPARSE|AREA_RECORD|Short path refused|Ambiguous path spelling'
    $shortObservation.result='PASS';$shortObservation.reason='Distinct native 8.3 spelling refused'
}
[IO.File]::WriteAllText((Join-Path $root 'short-name-observation.json'),(ConvertTo-Json $shortObservation -Compress))
foreach($junctionPath in @($run,$runs,$area)){
    $retained=Join-Path $root ('junction-target-'+[guid]::NewGuid().ToString('N'))
    [IO.Directory]::Move($junctionPath,$retained)
    try {
        New-Item -ItemType Junction -Path $junctionPath -Target $retained | Out-Null
        Refuses {Assert-DyeStage2Area $bindings} 'AREA_REPARSE'
    } finally {
        if(Test-Path -LiteralPath $junctionPath){
            $junction=Get-Item -LiteralPath $junctionPath -Force
            if(!($junction.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refuse removing non-junction fixture'}
            [IO.Directory]::Delete($junctionPath,$false)
        }
        [IO.Directory]::Move($retained,$junctionPath)
    }
    Assert-DyeStage2Area $bindings
}
foreach($replacePath in @($run,$approvals,$runs,$area)){
    $originalTuple=Get-DyeAreaTuple $replacePath
    $old=Join-Path $root ('retained-original-'+[guid]::NewGuid().ToString('N'))
    $replacement=Join-Path $root ('retained-replacement-'+[guid]::NewGuid().ToString('N'))
    [IO.Directory]::Move($replacePath,$old)
    try {
        [DyeStage2.AreaHandle]::ProvisionDirectory($replacePath,$originalTuple.sddl)
        if((Get-DyeAreaTuple $replacePath).sddl -cne $originalTuple.sddl){throw 'Replacement descriptor differs from original'}
        if($replacePath -ceq $area){[IO.File]::Copy((Join-Path $old 'area.json'),(Join-Path $replacePath 'area.json'))}
        Refuses {Assert-DyeStage2Area $bindings} 'AREA_REPLACED'
    } finally {
        [IO.Directory]::Move($replacePath,$replacement)
        [IO.Directory]::Move($old,$replacePath)
    }
}
$wrong=$bindings.Clone();$wrong.run_dir_file_id='0'*32
Refuses {Assert-DyeStage2Area $wrong} 'AREA_REPLACED'
$originalApproval=$approval+'.original'
[IO.File]::Move($approval,$originalApproval)
try {
    Write-B0Exclusive $approval ([IO.File]::ReadAllBytes($originalApproval))
    if((Get-DyeProbeHash $approval) -cne $bindings.approval_hash){throw 'Replacement fixture bytes differ'}
    Refuses {Assert-DyeStage2Area $bindings} 'AREA_REPLACED'
} finally {
    [IO.File]::Delete($approval)
    [IO.File]::Move($originalApproval,$approval)
}
$wrong=$bindings.Clone();$wrong.area_record_hash='0'*64
Refuses {Assert-DyeStage2Area $wrong} 'AREA_RECORD'
$wrong=$bindings.Clone();$wrong.run_class='live-real'
Refuses {Assert-DyeStage2Area $wrong} 'AREA_RECORD'
$inventoryCanary=Join-Path (Join-Path $f.m.control 'setup') 'inventory-fixture.txt'
Write-B0Exclusive $inventoryCanary (Get-B0TextBytes 'fixture-only')
try { Refuses {Assert-DyeStage2Area $bindings} 'S1B_INVENTORY_CHANGED' }
finally { [IO.File]::Delete($inventoryCanary) }
$before=ConvertTo-B0Json (Get-B0VerificationCore $f.m $f.id $f.journal)
$extra=Join-Path $area 'unexpected.txt'
Write-B0Exclusive $extra (Get-B0TextBytes 'fixture-only')
Refuses {Assert-DyeStage2Area $bindings} 'AREA_UNEXPECTED'
[IO.File]::Delete($extra)
$bindingPath=Join-Path $root 'fixture-binding.json'
Write-B0Exclusive $bindingPath (Get-B0TextBytes (ConvertTo-B0Json $bindings))
$verifyPath=Join-Path $ordinary 'fixture-verify-binding.json'
Write-B0Exclusive $verifyPath (Get-B0TextBytes (ConvertTo-B0Json $bindings))
& $ps @common -Action Verify -BindingPath $verifyPath -BindingHash (Get-DyeProbeHash $verifyPath) | Out-Null
if($LASTEXITCODE -ne 0){throw 'Fixture Verify failed'}
Remove-Item Env:DYE_SUPERVISOR_TEST,Env:DYE_A5_OPERATOR -ErrorAction SilentlyContinue
. ${quote(resolve('scripts/collab-supervisor/lib/windows-job.ps1'))}
# Measure the actual capture wait separately from helper compilation/startup.
$pipeNative=Join-Path $root 'native-held-pipe'
[void][IO.Directory]::CreateDirectory($pipeNative)
Write-B0Exclusive (Join-Path $pipeNative 'fixture-pipe-helper.ps1') ([Convert]::FromBase64String('${Buffer.from(pipeHelper).toString('base64')}'))
$pipeSelf=[Diagnostics.Process]::GetCurrentProcess()
Write-B0Exclusive (Join-Path $pipeNative 'fixture-pipe-target.json') (Get-B0TextBytes (ConvertTo-B0Json @{pid=$PID;created=$pipeSelf.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()}))
$pipeOut=New-Object DyeJobs.Capture;$pipeErr=New-Object DyeJobs.Capture
$pipeChild=New-Object DyeJobs.Process(${quote(process.execPath)},[string[]]@(${quote(resolve('tests/fixtures/collab-supervisor/fake-cli.mjs'))},'pipe-hold'),$pipeNative,$pipeOut,$pipeErr)
try{
    $until=[DateTime]::UtcNow.AddSeconds(8)
    while(!$pipeChild.Exited -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 10}
    if(!$pipeChild.Exited -or $pipeChild.ExitCode -ne 0){throw 'Native held-pipe child failed'}
    $pipeChild.Kill()
    $watch=[Diagnostics.Stopwatch]::StartNew()
    $drained=$pipeChild.WaitCaptures(1000)
    $waitMs=$watch.ElapsedMilliseconds
    if($drained -or $pipeOut.Complete -or !$pipeChild.IsEmpty() -or $waitMs -lt 900 -or $waitMs -gt 1500){throw 'Held pipe did not obey the 1000 ms capture wait'}
    $watch.Restart();$pipeChild.Dispose();$disposeMs=$watch.ElapsedMilliseconds
    if($disposeMs -gt 250 -or !$pipeOut.Abandoned){throw 'Memory disposal waited for external pipe EOF'}
    Write-B0Exclusive (Join-Path $root 'pipe-drain-budget.json') (Get-B0TextBytes (ConvertTo-B0Json @{waitMs=$waitMs;configuredWaitMs=1000;disposeMs=$disposeMs;empty=$true;complete=$false}))
}finally{
    $pipeChild.Kill();$pipeChild.Dispose()
    $receipt=Get-Content -LiteralPath (Join-Path $pipeNative 'fixture-pipe-receipt.json') -Raw | ConvertFrom-Json
    if($receipt.pid -ne $PID -or $receipt.created -cne $pipeSelf.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()){throw 'Native pipe owner mismatch'}
    [FixtureDirectoryAccess]::ClosePipe([long]$receipt.handle)
}
$probe=& ${quote(process.execPath)} ${quote(resolve('scripts/collab-supervisor/supervisor.js'))} platform-probes live test-fixture --spec $bindingPath
if($LASTEXITCODE -ne 0){throw ('Fixture probe failed; retained '+$run)}
$result=$probe | ConvertFrom-Json
if($result.run_class -cne 'live-test' -or $result.realResults -cne 'UNVERIFIED' -or
   $result.shape.projection.authMode -cne 'UNVERIFIED (bootstrap)' -or
   $result.done.capture.status -cne 'OBSERVED'){throw 'Expected a redacted fixture result'}
if($probe -match 'private-marker|private-key|example[.]invalid'){throw 'Raw auth text escaped into the result'}
# Validate bound root pins without launching another process or changing the
# reviewed sources. Each candidate is a new retained file in this fixture run.
$rootWire=Read-DyeProbeWire (Join-Path $run 'manifest.json') '' $true 'live-nonmodel'
# The typed reader returns a comparison tuple; the wire writer requires the
# original OS spelling for its narrowly scoped system PowerShell exception.
$rootWire.powershell_executable=Get-DyeSystemPowerShellPath
$rootWire.started_at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$rootWire.deadline_utc=$rootWire.started_at+$rootWire.total_ms
$goodRoot=Join-Path $run 'root-validation.json'
Write-DyeProbeWire $goodRoot $rootWire 'live-nonmodel'
[void](Get-DyeLiveProbeRoot $goodRoot (Get-DyeProbeHash $goodRoot))
foreach($pin in @('fixture_hash','executable_hash','target_hash','transport_hash','area_record_hash','approval_hash')){
    $candidate=@{};foreach($key in $rootWire.Keys){$candidate[$key]=$rootWire[$key]};$candidate[$pin]='C'*64
    $path=Join-Path $run ('root-refused-'+$pin+'.json')
    Write-DyeProbeWire $path $candidate 'live-nonmodel'
    Refuses {Get-DyeLiveProbeRoot $path (Get-DyeProbeHash $path)} 'Pinned|binding|AREA_RECORD'
}
$candidate=@{};foreach($key in $rootWire.Keys){$candidate[$key]=$rootWire[$key]};$candidate.run_class='live-real'
$path=Join-Path $run 'root-refused-real-temp.json'
Write-DyeProbeWire $path $candidate 'live-nonmodel'
Refuses {Get-DyeLiveProbeRoot $path (Get-DyeProbeHash $path)} 'Protected inventory target'
foreach($library in @('identity-collector.ps1','job-attest.ps1','auth-shape.ps1')){
    Refuses {Import-DyePinnedScript (Join-Path ${quote(resolve('scripts/collab-supervisor/lib'))} $library) ('C'*64)} 'hash|changed|pin'
}
foreach($file in [IO.Directory]::EnumerateFiles($run,'*',[IO.SearchOption]::AllDirectories)){
    if([IO.File]::ReadAllText($file) -match 'private-marker|private-key|example[.]invalid'){throw 'Raw auth text reached an evidence file'}
}
$templates=${quote(JSON.stringify({...INVENTORY_TEMPLATES, 'payload-identity': {route:'file',timeoutMs:15000},
  hold:{route:'memory-shape',timeoutMs:6000,stop:'TIMEOUT',exit:99},
  'cancel-hold':{route:'memory-shape',timeoutMs:15000,stop:'CANCELLED',exit:99,fixtureArg:'hold'},
  'parent-hold':{route:'memory-shape',timeoutMs:15000,stop:'PARENT_DEATH',fixtureArg:'hold'},
  'before-acl':{route:'memory-shape',timeoutMs:15000,fixtureArg:'auth'},
  'after-acl':{route:'memory-shape',timeoutMs:15000,fixtureArg:'auth'},
  'attest-fault':{route:'memory-shape',timeoutMs:6000,fixtureArg:'hold'},
  'pipe-hold':{route:'memory-shape',timeoutMs:15000,stop:'CAPTURE_INCOMPLETE'},
  limit:{route:'memory-shape',timeoutMs:15000,stdoutBytes:65536},
  'stderr-limit':{route:'memory-shape',timeoutMs:15000,stderrBytes:65536},
  'stderr-overflow':{route:'memory-shape',timeoutMs:15000,stderrBytes:65537,stop:'OVERSIZE'},
  'nested-safe':{route:'memory-shape',timeoutMs:15000},
  'nested-private':{route:'memory-shape',timeoutMs:15000},
  ...Object.fromEntries(Object.entries({jwt:'TOKEN_LIKE','long-hex':'TOKEN_LIKE',
    'long-base64':'TOKEN_LIKE','invalid-utf8':'NON_UTF8',duplicate:'NOT_JSON','sensitive-key':'TOKEN_LIKE','not-json':'NOT_JSON'})
    .map(([id,stop])=>[id,{route:'memory-shape',timeoutMs:15000,stop}])),
  marker:{route:'memory-shape',timeoutMs:15000,stop:'TOKEN_LIKE'}, 'ten-mib':{route:'memory-shape',timeoutMs:15000,stop:'OVERSIZE'}}))} | ConvertFrom-Json
Add-Type -TypeDefinition @'
public static class FixtureCancel {
 public static System.Threading.Tasks.Task<string> Drift(string run) {
  if(!run.StartsWith(System.IO.Path.GetTempPath(),System.StringComparison.OrdinalIgnoreCase))throw new System.Exception("Temp fixture required");
  return System.Threading.Tasks.Task.Run(()=> {
   string marker=System.IO.Path.Combine(run,"fixture-pause.json");
   var deadline=System.DateTime.UtcNow.AddSeconds(15);
   while(!System.IO.File.Exists(marker)&&System.DateTime.UtcNow<deadline)System.Threading.Thread.Sleep(5);
   if(!System.IO.File.Exists(marker))throw new System.TimeoutException("Fixture drift barrier not observed");
   var acl=System.IO.Directory.GetAccessControl(run);
   acl.AddAccessRule(new System.Security.AccessControl.FileSystemAccessRule(
    new System.Security.Principal.SecurityIdentifier("S-1-1-0"),System.Security.AccessControl.FileSystemRights.Read,
    System.Security.AccessControl.AccessControlType.Allow));
   System.IO.Directory.SetAccessControl(run,acl);
   using(var file=new System.IO.FileStream(System.IO.Path.Combine(run,"fixture-release"),System.IO.FileMode.CreateNew,
     System.IO.FileAccess.Write,System.IO.FileShare.Read))file.Flush(true);
   return marker;
  });
 }
 static string Number(string text,string name) {
  string key=((char)34)+name+((char)34);
  int at=text.IndexOf(key,System.StringComparison.Ordinal);
  if(at<0||at!=text.LastIndexOf(key,System.StringComparison.Ordinal))throw new System.Exception("Ambiguous fixture identity");
  at+=key.Length;while(at<text.Length&&(char.IsWhiteSpace(text[at])||text[at]==':'||text[at]==34))at++;
  int start=at;while(at<text.Length&&char.IsDigit(text[at]))at++;
  if(at==start)throw new System.Exception("Missing fixture identity");
  return text.Substring(start,at-start);
 }
 public static System.Threading.Tasks.Task<string> Start(string run,string node,bool parentDeath) {
  return System.Threading.Tasks.Task.Run(()=> {
   string steps=System.IO.Path.Combine(run,"steps");
   var deadline=System.DateTime.UtcNow.AddSeconds(12);
   while(System.DateTime.UtcNow<deadline) {
    if(System.IO.Directory.Exists(steps)) {
     foreach(string ready in System.IO.Directory.GetFiles(steps,"*.request.json.ready.json")) {
      string request=ready.Substring(0,ready.Length-".ready.json".Length);
      if(parentDeath) {
       string wire=System.IO.File.ReadAllText(request);
       string root=System.IO.File.ReadAllText(System.IO.Path.Combine(run,"launch-ready.json"));
       string pid=Number(wire,"parent_pid"),created=Number(wire,"parent_created");
       if(pid!=Number(root,"pid")||created!=Number(root,"created"))throw new System.Exception("Fixture parent binding mismatch");
       using(var process=System.Diagnostics.Process.GetProcessById(int.Parse(pid))) {
        if(process.StartTime.ToFileTimeUtc().ToString(System.Globalization.CultureInfo.InvariantCulture)!=created||
          !System.String.Equals(process.MainModule.FileName,node,System.StringComparison.OrdinalIgnoreCase))throw new System.Exception("Fixture process identity changed");
        System.IO.File.WriteAllText(System.IO.Path.Combine(run,"parent-killed-at.txt"),System.DateTime.UtcNow.ToString("o"));
        process.Kill();if(!process.WaitForExit(2000))throw new System.Exception("Fixture parent did not exit");
       }
       return request;
      }
      using(var file=new System.IO.FileStream(request+".cancel",System.IO.FileMode.CreateNew,
        System.IO.FileAccess.Write,System.IO.FileShare.Read))file.Flush(true);
      return request;
     }
    }
    System.Threading.Thread.Sleep(5);
   }
   throw new System.TimeoutException("Fixture wrapper readiness not observed");
  });
 }
}
'@
foreach($property in $templates.PSObject.Properties){
    $row=$property.Value
    $id='dye-live-'+[guid]::NewGuid().ToString()
    $case=Join-Path $runs ('stage2-'+$id)
    [DyeB0.Native]::MakeInheritedDirectory($case)
    $caseApproval=Join-Path $approvals ($property.Name+'.json')
    $approvalBody=@{mode='live-nonmodel';run_class='live-test';operation=$property.Name;run_id=$id}
    if($property.Name -cmatch '^[cl]-'){
        $approvalBody.inventory=@{kind='S2-C';mode='live-nonmodel';runClass='live-test';runId=$id;
            inventoryRegistryHash='${inventoryRegistryHash}';bundleHash='${inventoryTransportBundleHash()}';
            templateIds=@($property.Name);providerContactAllowed=$false;
            tools=@{};environments=@{}}
        $approvalBody.inventory.tools[$row.role]=@{path=${quote(process.execPath)};sha256=(Get-DyeProbeHash ${quote(process.execPath)})}
        $approvalBody.inventory.environments[$row.role]=$row.env
    }
    Write-B0Exclusive $caseApproval (Get-B0TextBytes (ConvertTo-B0Json $approvalBody))
    $caseBinding=$bindings.Clone()
    $caseBinding.run_id=$id
    $caseBinding.cwd=$case.ToUpperInvariant()
    $caseBinding.run_dir_file_id=(Get-DyeAreaTuple $case).id
    $caseBinding.approval_path=$caseApproval.ToUpperInvariant()
    $caseBinding.approval_file_id=(Get-DyeAreaTuple $caseApproval $false).id
    $caseBinding.approval_hash=Get-DyeProbeHash $caseApproval
    $caseBinding.operation=$property.Name
    $caseSpec=Join-Path $root ($property.Name+'.json')
    Write-B0Exclusive $caseSpec (Get-B0TextBytes (ConvertTo-B0Json $caseBinding))
    if($property.Name -ceq 'pipe-hold'){
        Write-B0Exclusive (Join-Path $case 'fixture-pipe-helper.ps1') ([Convert]::FromBase64String('${Buffer.from(pipeHelper).toString('base64')}'))
        $self=[Diagnostics.Process]::GetCurrentProcess()
        Write-B0Exclusive (Join-Path $case 'fixture-pipe-target.json') (Get-B0TextBytes (ConvertTo-B0Json @{pid=$PID;created=$self.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()}))
    }
    $cancelTask=$null
    if($property.Name -ceq 'attest-fault'){
        $priorPreference=$ErrorActionPreference
        try{
            $ErrorActionPreference='Continue'
            & ${quote(process.execPath)} ${quote(resolve('scripts/collab-supervisor/supervisor.js'))} platform-probes live test-fixture --spec $caseSpec 2> (Join-Path $case 'expected-attestation.stderr') | Out-Null
            $faultExit=$LASTEXITCODE
        }finally{$ErrorActionPreference=$priorPreference}
        if($faultExit -eq 0){throw 'Attestation writer failure became a successful observation'}
        $failures=@([IO.Directory]::EnumerateFiles($case,'failed-*.json'))
        if($failures.Count -ne 1){throw 'Attestation failure evidence missing'}
        $failure=Get-Content -LiteralPath $failures[0] -Raw | ConvertFrom-Json
        if($failure.status -cne 'INVALID' -or $failure.reason -cne 'ATTESTATION_INCOMPLETE'){throw 'Attestation failure classification lost'}
        $requests=@([IO.Directory]::EnumerateFiles((Join-Path $case 'steps'),'*.request.json'))
        if($requests.Count -ne 1){throw 'Attestation fixture made another attempt'}
        $done=Get-Content -LiteralPath ($requests[0]+'.done.json') -Raw | ConvertFrom-Json
        $shape=Get-Content -LiteralPath ($requests[0]+'.shape.json') -Raw | ConvertFrom-Json
        if(!$done.empty -or $done.attestationComplete -or $done.reason -cne 'wrapper_step_deadline' -or
            $shape.projection.stop -cne 'TIMEOUT' -or $shape.projection.shape -or $shape.durationMs -gt 9000){throw 'Attestation failure delayed termination or retained a shape'}
        continue
    }
    if($property.Name -cin @('before-acl','after-acl')){
        $driftTask=[FixtureCancel]::Drift($case)
        $priorPreference=$ErrorActionPreference
        try{
            $ErrorActionPreference='Continue'
            & ${quote(process.execPath)} ${quote(resolve('scripts/collab-supervisor/supervisor.js'))} platform-probes live test-fixture --spec $caseSpec 2> (Join-Path $case 'expected-drift.stderr') | Out-Null
            $driftExit=$LASTEXITCODE
        }finally{$ErrorActionPreference=$priorPreference}
        if($driftExit -eq 0 -or !$driftTask.Wait(1000)){throw 'Permission-only drift did not stop the run'}
        $failures=@([IO.Directory]::EnumerateFiles($case,'failed-*.json'))
        if($failures.Count -ne 1){throw 'Drift failure evidence missing'}
        $failure=Get-Content -LiteralPath $failures[0] -Raw | ConvertFrom-Json
        if($failure.status -cne 'INVALID' -or $failure.reason -cne 'AREA_PERMISSIONS'){throw 'Drift failure classification lost'}
        if($property.Name -ceq 'before-acl'){
            if(@([IO.Directory]::EnumerateFiles((Join-Path $case 'steps'),'*.ready.json')).Count){throw 'Child started after pre-child permission drift'}
        }else{
            $dones=@([IO.Directory]::EnumerateFiles((Join-Path $case 'steps'),'*.request.json.done.json'))
            if($dones.Count -ne 1 -or !(Get-Content -LiteralPath $dones[0] -Raw | ConvertFrom-Json).empty){throw 'Post-run drift occurred before child cleanup'}
        }
        continue
    }
    if($property.Name -cin @('cancel-hold','parent-hold')){$cancelTask=[FixtureCancel]::Start($case,${quote(process.execPath)},($property.Name -ceq 'parent-hold'))}
    if($property.Name -ceq 'parent-hold'){
        $priorPreference=$ErrorActionPreference
        try{
            $ErrorActionPreference='Continue'
            & ${quote(process.execPath)} ${quote(resolve('scripts/collab-supervisor/supervisor.js'))} platform-probes live test-fixture --spec $caseSpec 2> (Join-Path $case 'expected-parent-death.stderr') | Out-Null
            $parentExit=$LASTEXITCODE
        }finally{$ErrorActionPreference=$priorPreference}
        if($parentExit -eq 0 -or !$cancelTask.Wait(1000)){throw 'Parent death did not stop the test run'}
        $failurePaths=@([IO.Directory]::EnumerateFiles($case,'failed-*.json'))
        if($failurePaths.Count -ne 1){throw 'Parent death failure evidence missing'}
        $failure=Get-Content -LiteralPath $failurePaths[0] -Raw | ConvertFrom-Json
        if($failure.status -cne 'INVALID' -or $failure.reason -cne 'PARENT_DEATH'){throw 'Parent death reason was lost'}
        $launchDone=Get-Content -LiteralPath (Join-Path $case 'launch-done.json') -Raw | ConvertFrom-Json
        if(!$launchDone.empty){throw 'Parent death left a nonempty outer job'}
        $killedAt=[DateTime]::Parse([IO.File]::ReadAllText((Join-Path $case 'parent-killed-at.txt'))).ToUniversalTime()
        $stoppedAt=[DateTime]::Parse($launchDone.at).ToUniversalTime()
        if(($stoppedAt-$killedAt).TotalMilliseconds -lt 0 -or ($stoppedAt-$killedAt).TotalMilliseconds -gt 9000){throw 'Parent death exceeded the A5 stop bound'}
        $childReady=Get-Content -LiteralPath ($cancelTask.Result+'.ready.json') -Raw | ConvertFrom-Json
        . ${quote(resolve('scripts/collab-supervisor/lib/windows-job.ps1'))}
        $childState=[DyeJobs.Process]::Inspect([int]$childReady.pid)
        if(!$childState.Known -or $childState.Alive){throw 'Parent death left the owned child alive'}
        if(Test-Path -LiteralPath ($cancelTask.Result+'.shape.json')){
            $stopShape=Get-Content -LiteralPath ($cancelTask.Result+'.shape.json') -Raw | ConvertFrom-Json
            if($stopShape.projection.shape -or $stopShape.projection.stop -cne 'PARENT_DEATH'){throw 'Parent death published an auth shape'}
        }
        continue
    }
    try{
        $resultJson=& ${quote(process.execPath)} ${quote(resolve('scripts/collab-supervisor/supervisor.js'))} platform-probes live test-fixture --spec $caseSpec
    }finally{
        if($property.Name -ceq 'pipe-hold'){
            $receipt=Get-Content -LiteralPath (Join-Path $case 'fixture-pipe-receipt.json') -Raw | ConvertFrom-Json
            if($receipt.pid -ne $PID -or $receipt.created -cne $self.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()){throw 'Fixture pipe owner mismatch'}
            [FixtureDirectoryAccess]::ClosePipe([long]$receipt.handle)
        }
    }
    if($LASTEXITCODE -ne 0){throw ('Inventory template failed: '+$property.Name+'; retained '+$case)}
    $result=$resultJson | ConvertFrom-Json
    if($property.Name -ceq 'pipe-hold' -and (!$result.done.empty -or $result.shape.durationMs -gt 9000)){
        throw 'Held pipe delayed wrapper termination or left a job member'
    }
    if($cancelTask){
        if(!$cancelTask.Wait(1000)){throw 'Fixture cancel did not complete'}
        $cancelDone=Get-Content -LiteralPath ($cancelTask.Result+'.done.json') -Raw | ConvertFrom-Json
        if($cancelDone.reason -cne 'wrapper_cancelled' -or !$cancelDone.empty){throw 'Cancel did not empty J1'}
    }
    $expectedExit=if($null -ne $row.exit){[int]$row.exit}else{0}
    if($result.inventoryRegistryHash -cne '${inventoryRegistryHash}' -or $result.operation -cne $property.Name -or
        $result.done.exit -ne $expectedExit){throw ('Inventory result mismatch: '+$property.Name)}
    $requests=@([IO.Directory]::EnumerateFiles((Join-Path $case 'steps'),'*.request.json'))
    if($requests.Count -ne 1){throw 'Expected exactly one inventory attempt'}
    $request=Get-Content -LiteralPath $requests[0] -Raw | ConvertFrom-Json
    $argv=@(for($i=1;$i -lt $request.argv_count;$i++){$request.('argv_'+$i.ToString('D4'))})
    $expected=if($property.Name -ceq 'payload-identity'){'identity|'+$id.Substring(9).Replace('-','')}elseif($row.role){(@($row.role)+$row.argv) -join '|'}elseif($row.fixtureArg){$row.fixtureArg}else{$property.Name}
    if(($argv -join '|') -cne $expected -or $request.output_route -cne $row.route -or
        $request.step_ms -ne $row.timeoutMs){
        throw ('Inventory argv, output route or timeout mismatch: '+$property.Name)
    }
    if($row.stop){
        if($result.stop -cne $row.stop -or $result.shape.projection.stop -cne $row.stop -or $result.shape.projection.shape){throw ('Expected memory stop without shape: '+$property.Name)}
        $marker=(Get-B0Hash ([Text.Encoding]::UTF8.GetBytes('fixture-stdout|'+$id))).ToLowerInvariant().Substring(0,32)
        $marker2=(Get-B0Hash ([Text.Encoding]::UTF8.GetBytes('fixture-stderr|'+$id))).ToLowerInvariant().Substring(0,32)
        $digest=Get-B0Hash ([Text.Encoding]::UTF8.GetBytes($marker))
        $rawDigest=Get-B0Hash ([Text.Encoding]::UTF8.GetBytes('{"mode":"'+$marker+'"}'))
        $stderrDigest=Get-B0Hash ([Text.Encoding]::UTF8.GetBytes($marker2))
        if($property.Name -ceq 'ten-mib' -and ($result.shape.stdoutTotal -ne 10485760 -or $result.shape.stderrTotal -ne 10485760)){throw 'Overflow totals do not include all drained bytes'}
        if(!('FixtureEvidenceScan' -as [type])){
            Add-Type -TypeDefinition @'
public static class FixtureEvidenceScan {
 public static bool Contains(byte[] bytes,byte[] needle) {
  for(int offset=0;offset<=bytes.Length-needle.Length;offset++) {
   int index=0;while(index<needle.Length&&bytes[offset+index]==needle[index])index++;
   if(index==needle.Length)return true;
  }
  return false;
 }
}
'@
        }
        $needles=@($marker,$marker2,$digest.ToLowerInvariant(),$digest.ToUpperInvariant(),
            $rawDigest.ToLowerInvariant(),$rawDigest.ToUpperInvariant(),$stderrDigest.ToLowerInvariant(),$stderrDigest.ToUpperInvariant())
        foreach($file in [IO.Directory]::EnumerateFiles($root,'*',[IO.SearchOption]::AllDirectories)){
            $bytes=[IO.File]::ReadAllBytes($file)
            foreach($needle in $needles){
                foreach($encoding in @([Text.Encoding]::UTF8,[Text.Encoding]::Unicode)){
                    if([FixtureEvidenceScan]::Contains($bytes,$encoding.GetBytes($needle))){throw 'Raw marker or raw digest escaped'}
                }
            }
        }
    }
    if($property.Name -ceq 'payload-identity'){
        $beforePayload=Get-Content -LiteralPath (Join-Path $case 'payload-before.json') -Raw
        $afterPayload=Get-Content -LiteralPath (Join-Path $case 'payload-after.json') -Raw
        if($beforePayload -cne $afterPayload -or $result.payload.op -cne 'identity' -or !$request.payload_id){
            throw 'Deployed payload identity was not retained'
        }
    }
    if($row.route -ceq 'memory-shape'){
        if(($null -ne $row.stdoutBytes -and $result.shape.stdoutTotal -ne $row.stdoutBytes) -or
            ($null -ne $row.stderrBytes -and $result.shape.stderrTotal -ne $row.stderrBytes)){throw 'Exact boundary stream count differs'}
        if((!$row.stop -and $result.shape.projection.authMode -cne 'UNVERIFIED (bootstrap)') -or $request.stdout -or $request.stderr){
            throw 'Inventory auth did not use memory-only capture'
        }
        # Assemble needles so the generated test source itself contains neither
        # the fake private values nor their raw hashes. Scan only this run's files.
        $privateNeedles=@(('fixture'+'@example.invalid'),('https:'+'//example.invalid/'),
            ('01234567-'+'89ab-cdef-0123-456789abcdef'),('short-'+'private'),('private-'+'marker'),
            ('stage2-private-key'+'@example.invalid'),('stage2-private-marker'+'@example.invalid'))
        foreach($file in [IO.Directory]::EnumerateFiles($case,'*',[IO.SearchOption]::AllDirectories)){
            $bytes=[IO.File]::ReadAllBytes($file)
            foreach($encoding in @([Text.Encoding]::UTF8,[Text.Encoding]::Unicode)){
                $text=$encoding.GetString($bytes)
                foreach($needle in $privateNeedles){
                    $digest=Get-B0Hash ([Text.Encoding]::UTF8.GetBytes($needle))
                    if($text.Contains($needle) -or $text.Contains($digest) -or $text.Contains($digest.ToLowerInvariant())){
                        throw 'Private auth substring or its hash escaped the memory route'
                    }
                }
            }
        }
    }
}
if((ConvertTo-B0Json (Get-B0VerificationCore $f.m $f.id $f.journal)) -cne $before){throw 'Stage 1b inventory changed'}
function Snapshot-Stage2 {
    foreach($path in (@($area)+@([IO.Directory]::GetFileSystemEntries($area,'*',[IO.SearchOption]::AllDirectories) | Sort-Object))){
        $directory=[IO.Directory]::Exists($path)
        $entry=[ordered]@{path=$path;identity=(Get-DyeAreaTuple $path $directory)}
        if(!$directory){
            $entry.size=([IO.FileInfo]::new($path)).Length
            $entry.sha256=Get-DyeProbeHash $path
        }
        $entry
    }
}
$areaBefore=ConvertTo-B0Json @(Snapshot-Stage2)
[void](Invoke-B0RestoreCore $f.m $f.id $f.journal $f.restore $null)
if(Test-B0Exists $f.m.control){throw 'Stage 1b Restore did not remove its own control tree'}
if((ConvertTo-B0Json @(Snapshot-Stage2)) -cne $areaBefore){throw 'Stage 2 fixture changed during Stage 1b Restore'}
$drift=[IO.Directory]::GetAccessControl($run)
$drift.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($deny),'Read','Allow'))
[IO.Directory]::SetAccessControl($run,$drift)
Refuses {Assert-DyeStage2Area $bindings} 'AREA_PERMISSIONS'
$control=Fixture 'sensitivity'
[void](Invoke-B0ApplyCore $control.m $control.id $control.journal $null)
$entry=Join-Path $control.m.control 'setup\stage2-fixture.txt'
Write-B0Exclusive $entry (Get-B0TextBytes 'synthetic')
Refuses {Get-B0VerificationCore $control.m $control.id $control.journal} 'VERIFY: unexpected control content'
Refuses {Invoke-B0RestoreCore $control.m $control.id $control.journal $control.restore $null} 'UNCERTAIN: extra control content'
if(!(Test-B0Exists $entry)){throw 'Sensitivity control evidence was removed'}
for($fault=0;$fault -le 8;$fault++){
    $fixture=Fixture ('provision-fault-'+$fault)
    if((Invoke-B0ApplyCore $fixture.m $fixture.id $fixture.journal $null).result -cne 'PASS'){throw 'Fault fixture Apply failed'}
    $faultOrdinary=Join-Path $fixture.m.evidenceRoot 'WP-AUTO-02'
    $inventoryJson=& $ps -NoProfile -ExecutionPolicy Bypass -File $inventoryEntry -SourcePath $inventoryEntry -EntryHash $inventoryEntryHash -BundleHash $inventoryBundle -EvidenceRoot $fixture.m.evidenceRoot -JournalPath $fixture.journal -JournalHash (Get-DyeProbeHash $fixture.journal) -Fixture
    if($LASTEXITCODE -ne 0){throw 'Fault fixture inventory failed'}
    $faultInventory=$inventoryJson | ConvertFrom-Json
    $faultCommon=@('-NoProfile','-ExecutionPolicy','Bypass','-File',${quote(resolve('scripts/collab-supervisor/acceptance/stage2-area.ps1'))},
        '-SourcePath',${quote(resolve('scripts/collab-supervisor/acceptance/stage2-area.ps1'))},'-EntryHash',$entryHash,
        '-BundleHash',$bundleHash,'-EvidenceRoot',$fixture.m.evidenceRoot,'-InventoryPath',$faultInventory.path,
        '-InventoryHash',$faultInventory.inventoryHash,'-Fixture')
    $faultPlanJson=& $ps @faultCommon -Action Plan
    if($LASTEXITCODE -ne 0){throw 'Fault fixture Plan failed'}
    $faultPlan=$faultPlanJson | ConvertFrom-Json
    $faultArea=Join-Path $fixture.m.evidenceRoot '_stage2'
    $faultApproval=Join-Path $faultOrdinary 'approval.json'
    Write-B0Exclusive $faultApproval (Get-B0TextBytes (ConvertTo-B0Json @{kind='S2-P';area=$faultArea;planHash=$faultPlan.planHash;bundleHash=$bundleHash}))
    $priorPreference=$ErrorActionPreference
    try {
        $ErrorActionPreference='Continue'
        ('PROVISION STAGE2 '+$faultPlan.planHash.Substring(0,8)) | & $ps @faultCommon -Action Provision -PlanPath $faultPlan.path -PlanHash $faultPlan.planHash -ApprovalPath $faultApproval -ApprovalHash (Get-DyeProbeHash $faultApproval) -FixtureFaultAfter $fault 2> (Join-Path $faultOrdinary 'expected-interruption.stderr') | Out-Null
        $faultExit=$LASTEXITCODE
    }finally{$ErrorActionPreference=$priorPreference}
    if($faultExit -eq 0){throw ('Fault injection did not stop: '+$fault)}
    $failures=@([IO.Directory]::EnumerateFiles($faultOrdinary,'*-failed.json'))
    if($failures.Count -ne 1){throw 'Missing provisioning failure record'}
    $failure=Get-Content -LiteralPath $failures[0] -Raw | ConvertFrom-Json
    if($failure.result -cne 'FAILED' -or $failure.error -cne 'AREA_FIXTURE_INTERRUPTION'){throw 'Wrong provisioning failure'}
    $completed=@(Get-Content -LiteralPath $failure.journal | ForEach-Object {$_ | ConvertFrom-Json} | Where-Object {$_.record.phase -ceq 'done'})
    foreach($object in $completed){if(!(Test-Path -LiteralPath $object.record.path)){throw 'Failure removed a completed object'}}
    if((Get-B0VerificationCore $fixture.m $fixture.id $fixture.journal).result -cne 'PASS'){throw 'Failure changed Stage 1b'}
    $faultBindings=@{area_path=$faultArea;run_class='live-test'}
    $faultRecord=Join-Path $faultArea 'area.json'
    if(Test-Path -LiteralPath $faultRecord){$faultBindings.area_record_hash=Get-DyeProbeHash $faultRecord}
    Refuses {Assert-DyeStage2Area $faultBindings} 'AREA_MISSING|AREA_RECORD'
}
Write-Output 'PASS'
`, 'utf8');
  const ps = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const output = execFileSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
    encoding: 'utf8', timeout: 420000, windowsHide: true
  });
  assert.match(output, /PASS\s*$/);
});

test('native permission mutations retain file identity and refuse descriptor drift independently', { skip: !enabled }, () => {
  const root = mkdtempSync(join(tmpdir(), 'dye-stage2-permission-cases-'));
  const script = join(root, 'permissions.ps1');
  writeFileSync(script, `
$ErrorActionPreference='Stop'
. ${quote(resolve('scripts/collab-supervisor/lib/stage2-area.ps1'))}
$root=${quote(root)}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
public static class FixtureDescriptorMutation {
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
 static extern uint SetNamedSecurityInfo(string name,uint kind,uint info,IntPtr owner,IntPtr group,IntPtr dacl,IntPtr sacl);
 public static void Set(string path,string fixtureRoot,string sddl) {
  if(!path.StartsWith(fixtureRoot+"\\\\",StringComparison.OrdinalIgnoreCase)) throw new Exception("Fixture path required");
  var sd=new RawSecurityDescriptor(sddl);
  var bytes=new byte[sd.DiscretionaryAcl.BinaryLength];sd.DiscretionaryAcl.GetBinaryForm(bytes,0);
  uint protection=(sd.ControlFlags&ControlFlags.DiscretionaryAclProtected)!=0?0x80000000u:0x20000000u;
  var memory=Marshal.AllocHGlobal(bytes.Length);
  try {
   Marshal.Copy(bytes,0,memory,bytes.Length);
   uint error=SetNamedSecurityInfo(path,1,4u|protection,IntPtr.Zero,IntPtr.Zero,memory,IntPtr.Zero);
   if(error!=0) throw new System.ComponentModel.Win32Exception((int)error);
  } finally {Marshal.FreeHGlobal(memory);}
 }
}
'@

$owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$baseline='O:'+$owner+'G:'+$owner+'D:P(D;OICI;FA;;;AN)(A;OICI;FA;;;'+$owner+')(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)'
if(![DyeStage2.AreaHandle]::HasFullAccess($baseline)){throw 'Owner access check failed'}
if([DyeStage2.AreaHandle]::HasFullAccess($baseline.Replace(';AN)',';AU)'))){throw 'Current-token deny was not detected in memory'}
$denyAce='(D;OICI;FA;;;AN)'
$ownerCase=Join-Path $root 'owner-binding-mismatch'
[DyeStage2.AreaHandle]::ProvisionDirectory($ownerCase,$baseline)
$ownerActual=Get-DyeAreaTuple $ownerCase
$ownerExpected=@{volume=$ownerActual.volume;id=$ownerActual.id;sddl=$ownerActual.sddl.Replace(('O:'+$owner),'O:S-1-5-7')}
if($ownerExpected.sddl -ceq $ownerActual.sddl){throw 'Owner fixture did not change expected identity'}
$ownerHandle=New-Object DyeStage2.AreaHandle($ownerCase,$true,$false)
try{
    try{Assert-DyeAreaTuple $ownerHandle $ownerExpected;throw 'Mismatched owner accepted'}
    catch{if($_.ToString() -notmatch '^AREA_PERMISSIONS$'){throw}}
}finally{$ownerHandle.Dispose()}
# The owner test changes the bound expected descriptor, never ownership on disk.
if((Get-DyeAreaTuple $ownerCase).sddl -cne $ownerActual.sddl){throw 'Owner fixture changed actual permissions'}
$variants=@(
    @{name='unprotected';sddl=$baseline.Replace('D:P','D:')},
    @{name='missing-deny';sddl=$baseline.Replace($denyAce,'')},
    @{name='different-deny';sddl=$baseline.Replace(';AN)', ';S-1-5-8)')},
    @{name='everyone-allow';sddl=($baseline+'(A;OICI;GR;;;WD)')},
    @{name='users-allow';sddl=($baseline+'(A;OICI;GR;;;BU)')},
    @{name='reordered';sddl=($baseline.Replace($denyAce,'')+$denyAce)},
    @{name='explicit-approval-ace';sddl=($baseline+'(A;;GR;;;WD)')},
    @{name='explicit-run-ace';sddl=($baseline+'(A;;GW;;;WD)')}
)
foreach($variant in $variants){
    $area=Join-Path $root $variant.name
    [DyeStage2.AreaHandle]::ProvisionDirectory($area,$baseline)
    $before=Get-DyeAreaTuple $area
    [FixtureDescriptorMutation]::Set($area,$root,$variant.sddl)
    $actual=New-Object DyeStage2.AreaHandle($area,$true,$false)
    try {
        if($actual.FileId -cne $before.id -or $actual.Volume -cne $before.volume){throw 'Mutation replaced directory'}
        if($actual.Sddl -ceq $before.sddl){throw ('Mutation not observed: '+$variant.name)}
        try {Assert-DyeAreaTuple $actual $before;throw 'Invalid descriptor accepted'}
        catch {if($_.ToString() -notmatch '^AREA_PERMISSIONS$'){throw}}
    }finally{$actual.Dispose()}
}
Write-Output 'PASS 8 native descriptor mutations'
`, 'utf8');
  const output = execFileSync(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { encoding: 'utf8', timeout: 15000 });
  assert.match(output, /PASS 8 native descriptor mutations/);
});
