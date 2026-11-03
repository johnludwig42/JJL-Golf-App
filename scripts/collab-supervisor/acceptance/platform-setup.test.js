// Explicit opt-in only. This file is outside npm test's tests/*.test.js glob.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve,relative } from 'node:path';
import { execFileSync } from 'node:child_process';
const enabled=process.platform==='win32'&&process.env.DYE_SETUP_TEST==='1';
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const library=resolve('scripts/collab-supervisor/lib/setup-acl.ps1');
const runtime=join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
function run(body){
  const root=mkdtempSync(join(tmpdir(),'dye-setup-test-'));
  assert.ok(!relative(tmpdir(),root).startsWith('..'));
  const driver=join(root,'acceptance.ps1');
  writeFileSync(driver,`$ErrorActionPreference='Stop'
. ${quote(library)}
$root=${quote(root)}
function Check($value,$why){if(!$value){throw $why}}
function Refuses([scriptblock]$action,[string]$pattern){$caught=$false;try{& $action}catch{$caught=$true;if($_.ToString() -notmatch $pattern){throw}};Check $caught ('expected refusal '+$pattern)}
Initialize-B0Native
$owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
function Fixture {
 $base=[IO.Path]::Combine($root,[guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($base)
 $m=[ordered]@{schema=1;repo=[IO.Path]::Combine($base,'repo');evidenceRoot=[IO.Path]::Combine($base,'evidence');profileClaude=[IO.Path]::Combine($base,'claude');profileCodex=[IO.Path]::Combine($base,'codex');profileSupabase=[IO.Path]::Combine($base,'supabase');temp=[IO.Path]::Combine($base,'temp');owner=$owner;deny='S-1-5-7';sddl=(Get-B0Descriptor $owner 'S-1-5-7');targets=@();parents=@()}
 foreach($p in @($m.repo,$m.evidenceRoot,$m.profileClaude,$m.profileCodex,$m.profileSupabase,$m.temp)){[void][IO.Directory]::CreateDirectory($p)}
 [void][IO.Directory]::CreateDirectory([IO.Path]::Combine($m.evidenceRoot,'WP-AUTO-02'))
 $m.control=[IO.Path]::Combine($m.evidenceRoot,'_supervisor');$m.targets=Get-B0Targets $m;$m.parents=Get-B0Parents $m
 $id=[guid]::NewGuid().ToString('N');return @{m=$m;id=$id;journal=[IO.Path]::Combine($base,'apply.jsonl');restore=[IO.Path]::Combine($base,'restore.jsonl')}
}
function Failure($f,[string]$action) {
 $folder=[IO.Path]::Combine($f.m.evidenceRoot,'WP-AUTO-02')
 $files=@([IO.Directory]::EnumerateFiles($folder,('stage1b-'+$action+'-'+$f.id+'-failed-*.json')))
 Check ($files.Count -ge 1) ('failure evidence '+$action)
 $record=Read-B0Json $files[-1]
 Check ($record.result -eq 'FAILED' -and $record.cleanupPolicy -eq 'retain-all-when-uncertain') 'failure status/policy'
 foreach($o in $record.objects) {
  Check ($o.classification -in @('CERTAIN','UNCERTAIN','ABSENT')) 'classification'
  Check ($o.PSObject.Properties['size'] -and $o.PSObject.Properties['owner'] -and $o.PSObject.Properties['id'] -and $o.PSObject.Properties['createdUtc'] -and $o.PSObject.Properties['writtenUtc']) 'metadata fields'
  if($o.kind -eq 'file' -and $o.size -gt 52){Check (!$o.PSObject.Properties['hash']) 'large file hash excluded'}
 }
 return $record
}
${body}
Write-Output 'PASS'
`, 'utf8');
  // Retain every root, including failed fixtures; do not erase evidence.
  console.log('retained setup-test root: '+root);
  const output=execFileSync(runtime,['-NoProfile','-ExecutionPolicy','Bypass','-File',driver],{encoding:'utf8',windowsHide:true,timeout:120000});
  assert.match(output,/PASS\s*$/);
}
function acceptance(name,body){test('setup.acceptance.'+name,{skip:!enabled},()=>run(body));}
acceptance('create_verify_restore',`
$f=Fixture;$r=Invoke-B0Apply $f.m $f.id $f.journal;Check ($r.result -eq 'PASS') 'verify'
$s=Get-B0Snapshot $f.m.control;Check ($s.Owner -eq $owner) 'owner';Check ($s.Sddl -match 'D:P') 'protected'
foreach($t in $f.m.targets){Check ((Get-B0Snapshot $t.path).Size -eq 52) '52-byte sentinel'}
$r=Invoke-B0Restore $f.m $f.id $f.journal $f.restore;Check ($r.result -eq 'RESTORED') 'restore';Check (!(Test-B0Exists $f.m.control)) 'control removed'
[void](Invoke-B0Restore $f.m $f.id $f.journal $f.restore)
`);
acceptance('operator_deny_in_memory_only',`
$f=Fixture;$denied=Get-B0Descriptor $owner $owner
Check (![DyeB0.Native]::HasFullAccess($denied)) 'self deny must fail in memory'
Refuses {Assert-B0Token 'S-1-5-7' @($owner,'S-1-5-7')} 'OPERATOR_BLOCKED'
Check (!(Test-B0Exists $f.m.control)) 'nothing created'
`);
acceptance('existing_target_refuses',`
$f=Fixture;Write-B0Exclusive $f.m.targets[0].path (Get-B0TextBytes 'pre-existing')
Refuses {Invoke-B0Apply $f.m $f.id $f.journal} 'EXISTS'
Check (!(Test-B0Exists $f.m.control)) 'no control';Check (!(Test-B0Exists $f.journal)) 'no journal'
`);
acceptance('interrupt_every_create_before_done',`
foreach($step in @('before-acl-evidence','control','approvals','tools','setup','run','manifest','before-acl','values','access-probe','S1','S2','S3','S4','S5','S6')) {
 $f=Fixture;$wantedStep=$step;$fault={param($s,$phase,$path) if($s -eq $wantedStep -and $phase -eq 'after-mutation'){throw 'INJECTED'}}.GetNewClosure()
 Refuses {Invoke-B0Apply $f.m $f.id $f.journal $fault} 'INJECTED'
 $j=Read-B0Journal $f.journal;$last=@($j.rows|Where-Object {$_.event -eq 'intent' -and $_.step -eq $step})[-1]
 Check ((Get-B0Classification $null (Get-B0Observed $last.path)) -eq 'UNCERTAIN') ('uncertain '+$step)
 $failure=Failure $f 'apply';Check (@($failure.objects|Where-Object {$_.path -ceq $last.path -and $_.classification -eq 'UNCERTAIN'}).Count -eq 1) 'apply uncertain record'
 $reported=@($failure.objects|Where-Object {$_.path -ceq $last.path})[0];Check ($reported.id -and $reported.owner -and $reported.createdUtc -and $reported.writtenUtc) 'extant uncertain metadata'
 Refuses {Invoke-B0Restore $f.m $f.id $f.journal $f.restore} 'UNCERTAIN'
 $failure=Failure $f 'restore';Check (@($failure.objects|Where-Object {$_.path -ceq $last.path -and $_.classification -eq 'UNCERTAIN'}).Count -eq 1) 'restore uncertain record'
 Check (Test-B0Exists $last.path) 'retained uncertain'
}
`);
acceptance('partial_sentinels_are_retained',`
foreach($size in @(0,1,50,51)) {
 $f=Fixture;$fault={param($s,$phase,$path)if($s -eq 'S1' -and $phase -eq 'after-mutation'){[IO.File]::WriteAllBytes($path,(New-Object byte[] $size));throw 'PARTIAL'}}
 Refuses {Invoke-B0Apply $f.m $f.id $f.journal $fault} 'PARTIAL'
 Refuses {Invoke-B0Restore $f.m $f.id $f.journal $f.restore} 'UNCERTAIN'
 Check ((Get-B0Snapshot $f.m.targets[0].path).Size -eq $size) 'partial retained'
}
`);
acceptance('changed_file_and_extra_child_refuse',`
$f=Fixture;[void](Invoke-B0Apply $f.m $f.id $f.journal)
[IO.File]::WriteAllText($f.m.targets[0].path,'changed')
Refuses {Get-B0Verification $f.m $f.id $f.journal} 'VERIFY'
Refuses {Invoke-B0Restore $f.m $f.id $f.journal $f.restore} 'UNCERTAIN'
$g=Fixture;[void](Invoke-B0Apply $g.m $g.id $g.journal);Write-B0Exclusive ([IO.Path]::Combine($g.m.control,'extra.txt')) (Get-B0TextBytes 'extra')
Refuses {Invoke-B0Restore $g.m $g.id $g.journal $g.restore} 'UNCERTAIN'
`);
acceptance('restore_interrupted_after_each_delete',`
foreach($step in @('S1','S2','S3','S4','S5','S6','manifest','before-acl','values','run','setup','tools','approvals','control')) {
 $f=Fixture;[void](Invoke-B0Apply $f.m $f.id $f.journal)
 $fault={param($s,$phase,$path)if($s -eq $step -and $phase -eq 'after-delete'){throw 'INTERRUPTED'}}
 Refuses {Invoke-B0Restore $f.m $f.id $f.journal $f.restore $fault} 'INTERRUPTED'
 [void](Invoke-B0Restore $f.m $f.id $f.journal $f.restore)
 Check (!(Test-B0Exists $f.m.control)) ('recovered '+$step)
}
`);
acceptance('replacement_before_delete_refuses',`
$f=Fixture;[void](Invoke-B0Apply $f.m $f.id $f.journal)
$fault={param($s,$phase,$path)if($s -eq 'S1' -and $phase -eq 'before-delete'){[IO.File]::Move($path,$path+'.kept');[IO.File]::WriteAllText($path,'replacement')}}
Refuses {Invoke-B0Restore $f.m $f.id $f.journal $f.restore $fault} 'UNCERTAIN'
Check ([IO.File]::ReadAllText($f.m.targets[0].path) -eq 'replacement') 'replacement untouched'
`);
acceptance('junction_refuses',`
$f=Fixture;$link=[IO.Path]::Combine($root,'junction')
New-Item -ItemType Junction -Path $link -Target $f.m.repo | Out-Null
Refuses {Assert-B0Path ([IO.Path]::Combine($link,'future')) -MissingLeaf} 'reparse'
`);
acceptance('dacl_drift_refuses',`
$f=Fixture;[void](Invoke-B0Apply $f.m $f.id $f.journal)
# Only this test-created tree changes; never target the sandbox group.
$acl=[IO.Directory]::GetAccessControl($f.m.control);$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-7'),'Read','Allow'));[IO.Directory]::SetAccessControl($f.m.control,$acl)
Refuses {Get-B0Verification $f.m $f.id $f.journal} 'VERIFY'
Refuses {Invoke-B0Restore $f.m $f.id $f.journal $f.restore} 'UNCERTAIN'
Check (Test-B0Exists $f.m.control) 'protected folder permission drift remains strict'
`);
acceptance('parent_permission_drift_reports_and_restores',`
$f=Fixture;[void](Invoke-B0Apply $f.m $f.id $f.journal)
$parent=$f.m.profileClaude
$acl=[IO.Directory]::GetAccessControl($parent)
$rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-7'),'Read','ContainerInherit,ObjectInherit','None','Allow')
$acl.AddAccessRule($rule);[IO.Directory]::SetAccessControl($parent,$acl)
Refuses {Get-B0Verification $f.m $f.id $f.journal} 'PARENT_DRIFT'
$failed=Failure $f 'verify'
Check (@($failed.parentDrift|Where-Object {$_.path -ceq $parent}).Count -eq 1) 'verify drift record'
$sentinel=@($f.m.targets|Where-Object {$_.name -eq 'S2'})[0].path
Check (@($failed.objects|Where-Object {$_.path -ceq $sentinel -and $_.classification -eq 'CERTAIN' -and $_.permissionDrift}).Count -eq 1) 'file permission drift is certain'
$r=Invoke-B0Restore $f.m $f.id $f.journal $f.restore
Check ($r.result -eq 'RESTORED' -and !(Test-B0Exists $sentinel)) 'cleanup after inherited drift'
Check (@($r.parentDrift|Where-Object {$_.path -ceq $parent}).Count -eq 1) 'successful restore drift'
Check (@($r.filePermissionDrift|Where-Object {$_.path -ceq $sentinel}).Count -eq 1) 'file drift reported'
Check ((Get-B0ParentDrift $f.m).Count -eq 1) 'parent permission not repaired'
`);
acceptance('failure_inventory_includes_all_objects_without_values',`
$f=Fixture
$fault={param($s,$phase,$path)if($s -eq 'S2' -and $phase -eq 'after-mutation'){[IO.File]::WriteAllBytes($path,(New-Object byte[] 51));throw 'PARTIAL'}}
Refuses {Invoke-B0Apply $f.m $f.id $f.journal $fault} 'PARTIAL'
$record=Failure $f 'apply'
Check ($record.objects.Count -eq (Get-B0ExpectedPaths $f.m $f.id).Count) 'complete fixed target inventory'
Check (@($record.objects|Where-Object {$_.classification -eq 'CERTAIN'}).Count -gt 0) 'certain objects present'
Check (@($record.objects|Where-Object {$_.classification -eq 'UNCERTAIN'}).Count -gt 0) 'uncertain objects present'
Check (@($record.objects|Where-Object {$_.classification -eq 'ABSENT'}).Count -gt 0) 'absent objects present'
$text=ConvertTo-B0Json $record
Check ($text -notmatch 'WP-AUTO-02-SENTINEL-[a-f0-9]{32}') 'no sentinel values'
Refuses {Invoke-B0Restore $f.m $f.id $f.journal $f.restore} 'UNCERTAIN'
foreach($t in $f.m.targets|Where-Object {$_.name -in @('S1','S2')}){Check (Test-B0Exists $t.path) 'all cleanup blocked on uncertainty'}
`);
acceptance('failure_evidence_storage_error_keeps_original_failure_visible',`
$f=Fixture
$fault={param($s,$phase,$path)if($s -eq 'control' -and $phase -eq 'after-mutation'){
 $folder=[IO.Path]::Combine($f.m.evidenceRoot,'WP-AUTO-02')
 [IO.Directory]::Move($folder,$folder+'-retained')
 throw 'INJECTED_STORAGE_FAILURE'
}}
$script:B0TestCaught=$null
$messages=@(& {try{Invoke-B0Apply $f.m $f.id $f.journal $fault}catch{$script:B0TestCaught=$_.Exception.Message}} 2>&1)
Check ($script:B0TestCaught -match 'INJECTED_STORAGE_FAILURE') 'original failure preserved'
Check (($messages|Out-String) -match 'FAILURE_EVIDENCE_WRITE_FAILED') 'evidence failure visible'
Check (Test-B0Exists $f.journal) 'journal retained'
Check (Test-B0Exists $f.m.control) 'uncertain folder retained'
`);
