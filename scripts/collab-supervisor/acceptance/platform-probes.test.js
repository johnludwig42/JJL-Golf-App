import test from 'node:test';
import assert from 'node:assert/strict';
import { refuseReal } from '../lib/policy.js';
import { cliRepository,cli } from '../../../tests/fixtures/collab-supervisor/cli-repository.js';
import { spawn,execFileSync } from 'node:child_process';
import { readFileSync,writeFileSync,existsSync,linkSync,mkdtempSync,readdirSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { hash } from '../lib/policy.js';
import { realSweep } from '../lib/processes.js';
import { Evidence } from '../lib/evidence.js';
import { AUTH_KEYS, AUTH_WORDS } from '../lib/auth.js';

test('sealed launcher and wrapper reject invalid mode, switch and environment combinations before reading the request', {skip:process.platform!=='win32'}, () => {
  const directory = mkdtempSync(join(tmpdir(), 'dye-stage2-mode-matrix-'));
  const ps = join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const request = join(directory, 'never-created.json');
  let rejected = 0;
  for(const entry of ['launch.ps1','run-step.ps1']) {
    for(const mode of ['fake','live-nonmodel','Fake','live','live-nonmodel ','']) {
      for(const harness of [false,true]) for(const setting of [undefined,'1','0']) {
        const allowed = mode==='fake' && harness && setting==='1' || mode==='live-nonmodel' && !harness && setting===undefined;
        if(allowed) continue; // Positive paths execute in the integrated fixture suites.
        const env = {...process.env}; delete env.DYE_SUPERVISOR_TEST; delete env.DYE_A5_OPERATOR;
        if(setting!==undefined) env.DYE_SUPERVISOR_TEST=setting;
        const args=['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve('scripts/collab-supervisor',entry),
          '-SpecPath',request,'-ManifestHash','A'.repeat(64)];
        if(mode) args.push('-ProbeMode',mode);
        if(harness) args.push('-TestHarness');
        let failure;
        try { execFileSync(ps,args,{env,windowsHide:true,encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}); }
        catch(error) { failure=error; }
        assert.ok(failure,`${entry}/${mode}/${harness}/${setting} accepted`);
        assert.match(failure.stderr,/mode gate|Synthetic probe gate refused|rejects test flags|Unexpected (manifest hash|probe parameters)/);
        assert.doesNotMatch(failure.stderr,/never-created|cannot find|could not find/i);
        rejected++;
      }
    }
  }
  assert.equal(rejected,68);
  assert.deepEqual(readdirSync(directory),[]);
});

test('legacy fake settings cannot select live branches or memory capture', {skip:process.platform!=='win32'}, () => {
  const directory=mkdtempSync(join(tmpdir(),'dye-legacy-mode-'));
  const fixture=resolve('tests/fixtures/collab-supervisor/fake-agent.js');
  const ps=join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  for(const entry of ['launch.ps1','run-step.ps1']) {
    const prefix=join(directory,entry),spec=prefix+'.json';
    writeFileSync(spec,JSON.stringify({kind:'fake',executable:process.execPath,fixture,fixtureHash:hash(readFileSync(fixture)),
      cwd:directory,args:[fixture,'ready'],stdout:prefix+'.out',stderr:prefix+'.err',ready:prefix+'.ready',done:prefix+'.done',
      totalMs:5000,graceMs:100,stepMs:5000,disableParentWatch:true,
      mode:'live-nonmodel',runClass:'live-real',outputRoute:'memory-shape',areaRoot:{},authShapeHash:'bad'}));
    execFileSync(ps,['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve('scripts/collab-supervisor',entry),
      '-SpecPath',spec,'-TestHarness'],{env:{...process.env,DYE_SUPERVISOR_TEST:'1'},windowsHide:true,timeout:15000});
    assert.equal(JSON.parse(readFileSync(prefix+'.out','utf8')).verdict,'ready');
    const done=JSON.parse(readFileSync(prefix+'.done','utf8').replace(/^\uFEFF/,''));
    assert.equal(done.empty,true);assert.equal(done.mode,undefined);assert.equal(done.capture,undefined);
    assert.equal(existsSync(join(directory,'jobs')),false);
  }
});

test('deployed fixture payload retains its reviewed bytes and refuses paths outside its template', {skip:process.platform!=='win32'}, () => {
  const worktree = mkdtempSync(join(tmpdir(), 'dye-stage2-payload-'));
  const source = resolve('scripts/collab-supervisor/acceptance/stage2-probe-payload.mjs');
  const expected = 'CE09F5AD996B15EE5589E7B97EF5FAF232F8AB6CFECDA630B31EC84BB11BC4AA';
  const sourceBytes = readFileSync(source);
  assert.equal(hash(sourceBytes), expected);
  const imports = [...sourceBytes.toString('utf8').matchAll(/\bfrom ['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.ok(imports.length > 0 && imports.every(specifier => specifier.startsWith('node:')));
  const script = join(worktree, 'deployment.ps1');
  writeFileSync(script, `param($Transport,$JobSource,$Source,$Hash,$Worktree,$Node)
$ErrorActionPreference='Stop'
. $Transport
. $JobSource
. (Join-Path ([IO.Path]::GetDirectoryName($JobSource)) 'job-attest.ps1')
function Refuses([scriptblock]$Action,[string]$Expected){
    try{& $Action}catch{if($_.ToString() -match $Expected){return};throw}
    throw ('Expected refusal '+$Expected)
}
Refuses {New-DyePayloadDeployment $Source ('0'*64) $Worktree} 'PAYLOAD_SOURCE_HASH'
$tamperedSource=Join-Path $Worktree 'tampered-source.mjs'
[IO.File]::WriteAllText($tamperedSource,'tampered fixture source')
Refuses {New-DyePayloadDeployment $tamperedSource $Hash $Worktree} 'PAYLOAD_SOURCE_HASH'
if(Test-Path -LiteralPath (Join-Path $Worktree '.dye-stage2')){throw 'Mismatched source was deployed'}
$held=New-DyePayloadDeployment $Source $Hash $Worktree
$nonce='0123456789abcdef0123456789abcdef'
$sourcePath=$held.path
function RunPayload([string]$Case,[string[]]$ArgsList,[int]$ExpectedExit){
    Assert-DyePayloadDeployment $held
    $out=Join-Path $Worktree ($Case+'.out')
    $err=Join-Path $Worktree ($Case+'.err')
    $child=New-Object DyeJobs.Process($Node,[string[]](@($held.path)+$ArgsList),$Worktree,$out,$err)
    try{
        $until=[DateTime]::UtcNow.AddSeconds(8)
        while(!$child.Exited -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 10}
        if(!$child.Exited -or $child.ExitCode -ne $ExpectedExit){throw ('Fixture payload status: '+$Case)}
    }finally{$child.Kill();$child.Dispose()}
    Assert-DyePayloadDeployment $held
    if($ExpectedExit -eq 0){return @(Get-Content -LiteralPath $out | ForEach-Object {$_ | ConvertFrom-Json})}
    if((Get-Content -LiteralPath $err -Raw).Trim() -cne 'PAYLOAD_REFUSED'){throw 'Expected fixed refusal'}
}
try{
    Refuses {New-DyePayloadDeployment $Source $Hash $Worktree} 'PAYLOAD_DIRECTORY_EXISTS_OR_DENIED'
    Refuses {[IO.File]::WriteAllText($held.path,'tampered')} 'denied|sharing|used by another process'
    Refuses {[IO.File]::Move($held.path,$held.path+'.moved')} 'denied|sharing|used by another process'
    $sentinel=Join-Path $Worktree ('sentinel-'+$nonce+'.txt')
    [IO.File]::WriteAllText($sentinel,'fixture-data-do-not-echo')
    $read=RunPayload 'read' @('read-hash',$nonce,$sentinel) 0
    if($read.result.sha256 -ine (Get-DyeProbeHash $sentinel) -or $read.result.size -ne 24){throw 'Fixture hash mismatch'}
    if((Get-Content -LiteralPath (Join-Path $Worktree 'read.out') -Raw).Contains('fixture-data-do-not-echo')){throw 'Fixture bytes escaped'}
    RunPayload 'wrong-path' @('read-hash',$nonce,(Join-Path $Worktree 'deployment.ps1')) 64
    $canary=Join-Path $Worktree ('b2-'+$nonce+'-w0.canary')
    if(!(RunPayload 'create' @('create',$nonce,$canary) 0).result.created){throw 'Fixture canary missing'}
    if((RunPayload 'create-again' @('create',$nonce,$canary) 0).result.error -cne 'EEXIST'){throw 'Canary was overwritten'}
    $from=Join-Path $Worktree ('h1-'+$nonce)
    [void][IO.Directory]::CreateDirectory($from)
    if(!(RunPayload 'rename' @('rename',$nonce,$from,($from+'-renamed')) 0).result.renamed){throw 'Fixture rename missing'}
    RunPayload 'network-refused' @('connect',$nonce,'dns','github.com') 64
    foreach($scenario in @('child','grandchild','detached')){
        $out=Join-Path $Worktree ($scenario+'.out')
        $err=Join-Path $Worktree ($scenario+'.err')
        $treeProcess=New-Object DyeJobs.Process($Node,[string[]]@($held.path,'spawn-tree',$nonce,$scenario),$Worktree,$out,$err)
        $members=@()
        try{
            $expectedCount=if($scenario -ceq 'child'){2}else{3}
            $until=[DateTime]::UtcNow.AddSeconds(8)
            do{
                Start-Sleep -Milliseconds 25
                $sampleTask=[DyeStage2.JobAttest]::Start($treeProcess.Job.ToInt64())
                if(!$sampleTask.Wait(1000)){throw 'Fixture sample unavailable'}
                $sample=$sampleTask.Result
            }while(($sample.Status -cne 'OK' -or $sample.Members.Count -lt $expectedCount) -and !$treeProcess.Exited -and [DateTime]::UtcNow -lt $until)
            if($sample.Status -cne 'OK' -or $sample.Members.Count -ne $expectedCount){throw 'Fixture tree membership incomplete'}
            $members=@($sample.Members | ForEach-Object {@{pid=$_.Pid;created=[long]$_.CreatedFiletime}})
            Start-Sleep -Milliseconds 1700
            foreach($member in $members){
                if(![DyeJobs.Process]::ParentAlive($member.pid,$member.created)){throw 'Tree exited before explicit job termination'}
            }
        }finally{$treeProcess.Kill();$treeProcess.Dispose()}
        $until=[DateTime]::UtcNow.AddSeconds(3)
        do{
            $survivors=@($members | Where-Object {[DyeJobs.Process]::ParentAlive($_.pid,$_.created)})
            if($survivors.Count){Start-Sleep -Milliseconds 25}
        }while($survivors.Count -and [DateTime]::UtcNow -lt $until)
        if($survivors.Count){throw 'Fixture tree survivor after job termination'}
        $tree=@(Get-Content -LiteralPath $out | ForEach-Object {$_ | ConvertFrom-Json})
        if($tree.Count -ne $expectedCount -or @($tree | Where-Object nonce -cne $nonce).Count){throw 'Fixture tree evidence incomplete'}
        Assert-DyePayloadDeployment $held
    }
    # A12: descendants inherit the memory pipe, and killing their shared J1
    # must close every write end before the bounded drain completes.
    $memoryOut=New-Object DyeJobs.Capture
    $memoryErr=New-Object DyeJobs.Capture
    $memoryTree=New-Object DyeJobs.Process($Node,[string[]]@($held.path,'spawn-tree',$nonce,'grandchild'),$Worktree,$memoryOut,$memoryErr)
    try{
        $until=[DateTime]::UtcNow.AddSeconds(8)
        do{
            Start-Sleep -Milliseconds 25
            $sampleTask=[DyeStage2.JobAttest]::Start($memoryTree.Job.ToInt64())
            if(!$sampleTask.Wait(1000)){throw 'Memory tree sample unavailable'}
            $sample=$sampleTask.Result
        }while(($sample.Status -cne 'OK' -or $sample.Members.Count -ne 3) -and [DateTime]::UtcNow -lt $until)
        if($sample.Status -cne 'OK' -or $sample.Members.Count -ne 3){throw 'Memory grandchild absent'}
        if($memoryOut.Complete){throw 'Grandchild did not hold the pipe'}
        $memoryTree.Kill()
        if(!$memoryTree.WaitCaptures(1000) -or !$memoryTree.IsEmpty() -or !$memoryOut.Complete -or !$memoryErr.Complete){
            throw 'Grandchild pipe did not reach EOF after J1 termination'
        }
    }finally{$memoryTree.Kill();$memoryTree.Dispose()}
}finally{$held.stream.Dispose()}
$originalBytes=[IO.File]::ReadAllBytes($sourcePath)
$changedBytes=[byte[]]$originalBytes.Clone()
$changedBytes[0]=$changedBytes[0] -bxor 1
[IO.File]::WriteAllBytes($sourcePath,$changedBytes)
$changed=[IO.File]::OpenRead($sourcePath)
try{
    if([DyeProbeFile]::PayloadIdentity($changed.SafeFileHandle) -cne $held.id){throw 'Hash test accidentally replaced file'}
    $held.stream=$changed
    Refuses {Assert-DyePayloadDeployment $held} 'PAYLOAD_DEPLOYMENT_INVALID'
}finally{$changed.Dispose()}
[IO.File]::WriteAllBytes($sourcePath,$originalBytes)
[IO.File]::Move($sourcePath,$sourcePath+'.retained')
[IO.File]::WriteAllBytes($sourcePath,$originalBytes)
$replacement=[IO.File]::OpenRead($sourcePath)
try{
    if((Get-DyeProbeHash $sourcePath) -cne $Hash){throw 'Identity test bytes differ'}
    $held.stream=$replacement
    Refuses {Assert-DyePayloadDeployment $held} 'PAYLOAD_DEPLOYMENT_INVALID'
}finally{$replacement.Dispose()}
Write-Output 'PASS'
`, 'utf8');
  const ps = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const output = execFileSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
    resolve('scripts/collab-supervisor/lib/probe-transport.ps1'),
    resolve('scripts/collab-supervisor/lib/windows-job.ps1'), source, expected, worktree, process.execPath],
  {encoding:'utf8', timeout:30000, windowsHide:true});
  assert.match(output, /PASS\s*$/);
});

function invoke(mode,command,fixture,flags=[]){return new Promise((done,reject)=>{
  const child=spawn(process.execPath,[cli,'platform-probes',mode,command,'--spec',fixture.path,...flags],{windowsHide:true,env:{...process.env,DYE_SUPERVISOR_TEST:'1',DYE_A5_OPERATOR:'0'},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',data=>{stdout+=data;});child.stderr.on('data',data=>{stderr+=data;});child.on('error',reject);child.on('close',exit=>done({exit,stdout,stderr}));
});}
function sourceState(){
  const git=args=>execFileSync('git',['--no-optional-locks','-c','core.fsmonitor=false',...args],{encoding:'utf8'});
  return JSON.stringify({head:git(['rev-parse','HEAD']),refs:git(['for-each-ref','--format=%(refname) %(objectname)']),status:git(['status','--porcelain=v1','--untracked-files=all']),
    diff:hash(git(['diff','--binary','--no-ext-diff','--no-textconv','HEAD'])),untracked:git(['ls-files','--others','--exclude-standard','-z']).split('\0').filter(Boolean).map(path=>[path,hash(readFileSync(path))])});
}
test('Phase B probes are not approved or enabled in the Phase A bundle', () => {
  assert.throws(refuseReal, { code: 'NOT_PLATFORM_ACCEPTED' });
});

test('native memory capture projects fake auth output and attests the fixture job without writing raw output', {skip:process.platform!=='win32'}, () => {
  const directory = mkdtempSync(join(tmpdir(), 'dye-stage2-capture-'));
  const fixture = resolve('tests/fixtures/collab-supervisor/fake-cli.mjs');
  assert.equal(hash(readFileSync(fixture)).toUpperCase(), '8001DAC8B3AECE12862DC8A8CA1ABA69338DF30205A145F0D1773669F606AB96');
  const jobSource = resolve('scripts/collab-supervisor/lib/windows-job.ps1');
  const script = join(directory, 'capture.ps1');
  const authSource = resolve('scripts/collab-supervisor/lib/auth-shape.ps1');
  const attestSource = resolve('scripts/collab-supervisor/lib/job-attest.ps1');
  const identitySource = resolve('scripts/collab-supervisor/lib/identity-collector.ps1');
  writeFileSync(script, `param($JobSource,$AuthSource,$AttestSource,$IdentitySource,$Node,$Fixture,$Directory)
$ErrorActionPreference='Stop'
. $JobSource
. $AuthSource
. $AttestSource
. $IdentitySource
if([DyeStage2.AuthShape]::Vocabulary() -cne '${JSON.stringify({keys:AUTH_KEYS,words:AUTH_WORDS})}'){throw 'Native and registry vocabularies differ'}
Add-Type -TypeDefinition @'
using System;
using System.IO;
public sealed class FixtureReadFault : MemoryStream {
 bool first=true;
 public override int Read(byte[] buffer,int offset,int count) {
  if(!first) throw new IOException("fixture read failure");
  first=false;buffer[offset]=123;return 1;
 }
}
public sealed class FixtureExtractionFault {
 public bool Abandoned;
 public string Consume(Func<byte[],int,string> extract) {throw new Exception("fixture extraction failure");}
 public void Abandon() {Abandoned=true;}
}
public static class FixtureIdentityFault {
 public static void Denied(string checkpoint) {throw new UnauthorizedAccessException("fixture only");}
}
'@
$faultCapture=New-Object DyeJobs.Capture
$faultStream=New-Object FixtureReadFault
try {$faultCapture.Drain($faultStream)}finally{$faultStream.Dispose()}
if(!$faultCapture.Faulted -or $faultCapture.Complete -or $faultCapture.Total -ne 1){throw 'Read fault was not retained'}
$bufferField=$faultCapture.GetType().GetField('buffer',[Reflection.BindingFlags]'Instance,NonPublic')
if(@($bufferField.GetValue($faultCapture) | Where-Object {$_ -ne 0}).Count){throw 'Read fault retained bytes'}
$extractFault=New-Object FixtureExtractionFault
$emptyErrors=New-Object DyeJobs.Capture
$emptyStream=New-Object IO.MemoryStream
try {$emptyErrors.Drain($emptyStream)}finally{$emptyStream.Dispose()}
$faultProjection=[DyeStage2.AuthShape]::Project($extractFault,$emptyErrors,$true) | ConvertFrom-Json
if($faultProjection.stop -cne 'EXTRACT_FAULT' -or $faultProjection.shape -or !$extractFault.Abandoned -or !$emptyErrors.Abandoned){throw 'Extraction fault did not clear captures'}
foreach($size in @(65536,65537,10485760)){
 $boundary=New-Object DyeJobs.Capture
 $bytes=New-Object byte[] $size
 for($i=0;$i -lt $bytes.Length;$i++){$bytes[$i]=32}
 $stream=New-Object IO.MemoryStream(,$bytes)
 try {$boundary.Drain($stream)}finally{$stream.Dispose();[Array]::Clear($bytes,0,$bytes.Length)}
 if(!$boundary.Complete -or $boundary.Total -ne $size -or $boundary.Overflow -ne ($size -gt 65536)){throw 'Capture boundary mismatch'}
 $boundary.Abandon()
 if(@($bufferField.GetValue($boundary) | Where-Object {$_ -ne 0}).Count){throw 'Boundary case retained bytes'}
}
$expected=@{duplicate='NOT_JSON';'sensitive-key'='TOKEN_LIKE';'invalid-utf8'='NON_UTF8';
    marker='TOKEN_LIKE';jwt='TOKEN_LIKE';'long-hex'='TOKEN_LIKE';'long-base64'='TOKEN_LIKE';
    'not-json'='NOT_JSON'}
foreach($scenario in @('auth','overflow','duplicate','sensitive-key','invalid-utf8','marker','jwt',
    'long-hex','long-base64','not-json','nested-private','nested-safe','ten-mib')) {
    $output=New-Object DyeJobs.Capture
    $errors=New-Object DyeJobs.Capture
    $child=New-Object DyeJobs.Process($Node,[string[]]@($Fixture,$scenario),$Directory,$output,$errors)
    try {
        $deadline=[DateTime]::UtcNow.AddSeconds(8)
        while(-not $child.Exited -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 10}
        if(-not $child.Exited -or $child.ExitCode -ne 0){throw 'Synthetic child did not exit cleanly'}
        $child.Kill()
        if(-not $child.WaitCaptures(1000) -or -not $output.Complete -or -not $errors.Complete){throw 'Capture incomplete'}
        if($output.Faulted -or $errors.Faulted){throw 'Capture faulted'}
        if($scenario -eq 'overflow' -or $scenario -eq 'ten-mib') {
            $expectedBytes=if($scenario -eq 'overflow'){65537}else{10*1024*1024}
            if(-not $output.Overflow -or $output.Total -ne $expectedBytes){throw 'Overflow not detected'}
            if($scenario -eq 'ten-mib' -and (!$errors.Overflow -or $errors.Total -ne $expectedBytes)){throw 'Stderr overflow not drained'}
        } elseif($expected.ContainsKey($scenario)) {
            $result=[DyeStage2.AuthShape]::Project($output,$errors,$true) | ConvertFrom-Json
            if($result.stop -ne $expected[$scenario] -or $result.shape){throw 'Expected a fixed stop code and no shape'}
        } else {
            if($output.Overflow -or $output.Total -eq 0 -or $errors.Total -eq 0){throw 'Expected two bounded streams'}
            $shape=[DyeStage2.AuthShape]::Project($output,$errors,$true)
            if($shape.Contains('example.invalid') -or $shape.Contains('private-marker') -or $shape.Contains('short-private')){throw 'Raw output survived'}
            $result=$shape | ConvertFrom-Json
            if($result.authMode -ne 'UNVERIFIED (bootstrap)' -or -not $shape.Contains('"subscription"')){throw 'Expected redacted bootstrap shape'}
        }
    } finally { $child.Kill(); $child.Dispose() }
    if(-not $output.Abandoned -or -not $errors.Abandoned){throw 'Capture not abandoned'}
    foreach($capture in @($output,$errors)){
        $buffer=$capture.GetType().GetField('buffer',[Reflection.BindingFlags]'NonPublic,Instance').GetValue($capture)
        if($buffer.Length -ne 65536 -or @($buffer | Where-Object {$_ -ne 0}).Count){throw 'Capture exceeded cap or retained abandoned bytes'}
    }
}
$output=New-Object DyeJobs.Capture
$errors=New-Object DyeJobs.Capture
$child=New-Object DyeJobs.Process($Node,[string[]]@($Fixture,'hold'),$Directory,$output,$errors)
try {
    $recorder=New-Object DyeStage2.JobAttest+Recorder($child.Job.ToInt64(),(Join-Path $Directory 'stream-attest.jsonl'),'J1','dye-live-00000000-0000-0000-0000-000000000000')
    $failedRecorder=New-Object DyeStage2.JobAttest+Recorder($child.Job.ToInt64(),(Join-Path $Directory 'capture.ps1'),'J1','dye-live-00000000-0000-0000-0000-000000000000')
    $periodic=New-Object DyeStage2.JobAttest+Periodic($child.Job.ToInt64())
    Start-Sleep -Milliseconds 700
    if(-not (Test-Path -LiteralPath (Join-Path $Directory 'stream-attest.jsonl')) -or
       (Get-Item -LiteralPath (Join-Path $Directory 'stream-attest.jsonl')).Length -eq 0){throw 'Attestation not flushed while child alive'}
    if($failedRecorder.Finish(100) -or -not $failedRecorder.Faulted -or $child.Exited){throw 'Attestation failure affected child execution'}
    $periodic.Dispose()
    if(@($periodic.Samples | Where-Object Status -eq 'OK').Count -lt 1){throw 'Periodic owner sample missing'}
    $task=[DyeStage2.JobAttest]::Start($child.Job.ToInt64())
    if(-not $task.Wait(1000)){throw 'Membership sample did not finish'}
    $sample=$task.Result
    $root=@($sample.Members | Where-Object { $_.Pid -eq $child.Pid -and $_.CreatedFiletime -eq $child.Created.ToString() })
    if($sample.Status -ne 'OK' -or $sample.ActiveProcesses -ne $sample.Members.Count -or $root.Count -ne 1){
        throw ('Membership identity mismatch: '+($sample | ConvertTo-Json -Compress -Depth 4))
    }
    $identity=[DyeStage2.Identity]::Collect($child.Pid,$child.Created.ToString())
    if($identity.Error -or $identity.ParentPid -ne $PID -or
        $identity.ParentCreatedFiletime -cne [DyeJobs.Process]::CreationTime($PID).ToString() -or
        $identity.OwnerSid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -or
        !$identity.Image -or $identity.ImageSha256 -cnotmatch '^[A-F0-9]{64}$'){
        throw ('Fixture identity unavailable: '+$identity.Error)
    }
    if($identity.IntegritySid -notmatch '^S-1-16-' -or $null -eq $identity.RestrictedSids -or
       $identity.TokenType -notin @(1,2) -or $null -eq $identity.Elevated -or $identity.FieldErrors.Count -ne 0){
        throw 'Owned fixture token observations incomplete'
    }
    $reused=[DyeStage2.Identity]::Collect($child.Pid,'1')
    if($reused.Error -cne 'PID_RACE' -or $reused.Image -or $reused.OwnerSid){throw 'A reused PID must not produce identity evidence'}
    foreach($field in @('ParentPid','CreatedFiletime','ParentCreatedFiletime','OwnerSid','Image','ImageSha256')){
        if($null -ne $reused.$field -or $reused.FieldErrors[$field] -cne 'PID_RACE'){throw 'Missing per-field PID race evidence'}
    }
    . (Join-Path ([IO.Path]::GetDirectoryName($JobSource)) 'sweep.ps1')
    $observed=Get-DyeProbeProcessObservation -Mode 'live-nonmodel' -RunClass 'live-test' -Pids @($child.Pid) -Created @($child.Created.ToString())
    if($observed.Status -cne 'OK' -or $observed.Processes.Count -ne 1 -or
       $observed.Processes[0].ImageSha256 -cne $identity.ImageSha256){throw 'Candidate observation lost identity'}
    $raced=[DyeStage2.Identity]::Observe([int[]]@($child.Pid),[string[]]@('1'))
    if($raced.Status -cne 'INCOMPLETE' -or $raced.Processes.Count -ne 1 -or
       $raced.Processes[0].Error -cne 'PID_RACE'){throw 'Candidate failure was hidden'}
    $duplicate=[DyeStage2.Identity]::Observe([int[]]@($child.Pid,$child.Pid),[string[]]@('1','1'))
    if($duplicate.Status -cne 'INCOMPLETE'){throw 'Duplicate process observation accepted'}
    $denyCallback=[Delegate]::CreateDelegate([Action[string]],[FixtureIdentityFault].GetMethod('Denied'))
    $denied=[DyeStage2.Identity]::Collect($child.Pid,$child.Created.ToString(),$denyCallback)
    if($denied.Error -cne 'ACCESS_DENIED'){throw 'Injected access failure was not recorded'}
    foreach($field in @('ParentPid','CreatedFiletime','ParentCreatedFiletime','OwnerSid','Image','ImageSha256')){
        if($null -ne $denied.$field -or $denied.FieldErrors[$field] -cne 'ACCESS_DENIED'){throw 'Access failure retained a required field'}
    }
    $exitCallback=[Action[string]]{
        param($checkpoint)
        if($checkpoint -ceq 'collected'){
            $child.Kill()
            $end=[DateTime]::UtcNow.AddSeconds(2)
            while(!$child.Exited -and [DateTime]::UtcNow -lt $end){Start-Sleep -Milliseconds 5}
            if(!$child.Exited){throw 'Owned fixture did not exit'}
        }
    }
    $midExit=[DyeStage2.Identity]::Collect($child.Pid,$child.Created.ToString(),$exitCallback)
    if($midExit.Error -cne 'EXITED'){throw 'Mid-query exit was not recorded'}
    foreach($field in @('ParentPid','CreatedFiletime','ParentCreatedFiletime','OwnerSid','Image','ImageSha256')){
        if($null -ne $midExit.$field -or $midExit.FieldErrors[$field] -cne 'EXITED'){throw 'Mid-query exit retained identity evidence'}
    }
    if(-not $recorder.Finish(1000)){throw 'Attestation stream did not finish'}
    if(-not $child.WaitCaptures(1000)){throw 'Synthetic child did not drain'}
    $exited=[DyeStage2.Identity]::Collect($child.Pid,$child.Created.ToString())
    if($exited.Error -notin @('EXITED','NOT_FOUND') -or $exited.Image -or $exited.OwnerSid -or
       $exited.FieldErrors['Image'] -cne $exited.Error){throw 'Exited fixture produced identity evidence'}
    $task=[DyeStage2.JobAttest]::Start($child.Job.ToInt64())
    if(-not $task.Wait(1000) -or $task.Result.Status -ne 'OK' -or $task.Result.ActiveProcesses -ne 0){
        throw 'Expected an empty job'
    }
} finally { if($recorder){$recorder.Dispose()}; if($failedRecorder){$failedRecorder.Dispose()}; $child.Kill(); $child.Dispose() }
$invalid=[DyeStage2.JobAttest]::Start(-1)
if(-not $invalid.Wait(1000) -or $invalid.Result.Status -ne 'INCOMPLETE' -or $invalid.Result.Members.Count -ne 0){
    throw 'Invalid handle must not produce usable membership evidence'
}
`);
  const powershell = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  // This harness compiles four native libraries and runs multiple independent
  // scenarios. Their 8 s child, 1 s capture and 2 s cleanup bounds stay above;
  // the harness deadline must also allow compilation and loaded CI machines.
  execFileSync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, jobSource, authSource, attestSource, identitySource, process.execPath, fixture, directory], {timeout:60000, windowsHide:true});
  const entries=readFileSync(join(directory,'stream-attest.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  let previous='0'.repeat(64);
  for(const [seq,entry] of entries.entries()) {
    assert.equal(entry.record.seq,seq);
    assert.equal(entry.record.previous,previous);
    assert.equal(entry.hash,hash(JSON.stringify(entry.record)));
    previous=entry.hash;
  }
  assert.equal(entries[0].record.phase,'initial');
  assert.ok(entries.some(entry=>entry.record.phase==='periodic'));
  assert.equal(entries.at(-1).record.phase,'final');
  assert.equal(entries.at(-1).record.sample.activeProcesses,0);
  assert.deepEqual(readdirSync(directory), ['capture.ps1','stream-attest.jsonl']);
});

test('synthetic probe CLI: prepare, bound approval, three sealed launches, redacted evidence and clean jobs',{skip:process.platform!=='win32'},async()=>{
  const before=sourceState(),r=cliRepository({probes:{ids:['version','auth','refusal'],cap:3},stepMs:10000});
  const prepared=await invoke('fake','prepare',r);assert.equal(prepared.exit,0,prepared.stderr);assert.equal(JSON.parse(prepared.stdout).realResults,'UNVERIFIED');
  const approved=await invoke('fake','approve',r,['--fixture-consent']);assert.equal(approved.exit,0,approved.stderr);
  const result=await invoke('fake','run',r);assert.equal(result.exit,0,result.stderr+' '+result.stdout+' root='+r.root);
  const outcome=JSON.parse(result.stdout);assert.equal(outcome.stop,'READY');assert.equal(outcome.attempts,3);assert.ok(outcome.results.every(row=>row.synthetic && row.realResult==='UNVERIFIED'));
  assert.equal(outcome.results.find(row=>row.probeId==='auth').safe.mode,'synthetic-subscription');
  assert.deepEqual(new Evidence(outcome.run).verify(),[]);
  const active=JSON.parse(readFileSync(join(r.config.evidenceRoot,'active-run.json'),'utf8'));
  const clean=realSweep(active,join(r.root,'after-probe'));assert.equal(clean.result,'PASS');assert.equal(clean.escapes.length,0);assert.equal(clean.survivors.length,0);
  assert.equal(existsSync(join(r.config.evidenceRoot,'global.lock')),false);
  const shown=await invoke('fake','status',r);assert.equal(shown.exit,0,shown.stderr);assert.equal(JSON.parse(shown.stdout).deadline,outcome.deadline);
  const replay=await invoke('fake','run',r);assert.notEqual(replay.exit,0);assert.match(replay.stderr,/EVIDENCE_WRITE/);
  assert.equal(JSON.parse(readFileSync(join(r.config.evidenceRoot,'active-run.json'),'utf8')).runId,active.runId);
  assert.equal(sourceState(),before);console.log(JSON.stringify({case:'synthetic-probes',root:r.root,run:outcome.run,result:'PASS'}));
});
test('synthetic probe CLI: approval config mutation and live mode refuse before launcher',{skip:process.platform!=='win32'},async()=>{
  const before=sourceState(),r=cliRepository({probes:{ids:['version'],cap:1}});
  assert.equal((await invoke('fake','approve',r,['--fixture-consent'])).exit,0);
  r.config.probes.ids=['auth'];writeFileSync(r.path,JSON.stringify(r.config));
  const changed=await invoke('fake','run',r);assert.notEqual(changed.exit,0);assert.match(changed.stderr,/NOT_APPROVED/);
  assert.equal(existsSync(join(r.config.evidenceRoot,'active-run.json')),false);
  const live=await invoke('live','run',{path:'C:\\NEVER-READ-INSTALLED-PROFILES'});assert.notEqual(live.exit,0);assert.match(live.stderr,/NOT_PLATFORM_ACCEPTED/);
  assert.equal(sourceState(),before);
});
test('synthetic probe CLI: changed expected runtime pins refuse before any launch',{skip:process.platform!=='win32'},async()=>{
  const before=sourceState(),r=cliRepository({probes:{ids:['version'],cap:1}});
  const approved=await invoke('fake','approve',r,['--fixture-consent']);assert.equal(approved.exit,0,approved.stderr);
  const path=join(r.config.evidenceRoot,'probe-approvals.jsonl'),row=JSON.parse(readFileSync(path,'utf8'));
  row.runtimePins.powershell='F'.repeat(64);writeFileSync(path,JSON.stringify(row)+'\n');
  const changed=await invoke('fake','run',r);assert.notEqual(changed.exit,0);assert.match(changed.stderr,/AGENT_VERSION/);
  assert.equal(existsSync(join(r.config.evidenceRoot,'active-run.json')),false);assert.equal(existsSync(join(r.config.evidenceRoot,'probe-run-reserved.json')),false);
  assert.equal(sourceState(),before);
});
test('synthetic probe CLI: linked approval controls refuse before launcher creation',{skip:process.platform!=='win32'},async()=>{
  const before=sourceState();
  for(const name of ['probe-approvals.jsonl','approvals.jsonl','approved-package.md']){
    const r=cliRepository({probes:{ids:['version'],cap:1}});
    const approved=await invoke('fake','approve',r,['--fixture-consent']);assert.equal(approved.exit,0,approved.stderr);
    const path=join(r.config.evidenceRoot,name);linkSync(path,path+'.alias');
    const result=await invoke('fake','run',r);assert.notEqual(result.exit,0);assert.match(result.stderr,/INTEGRITY/);
    assert.equal(existsSync(join(r.config.evidenceRoot,'probe-run-reserved.json')),false);
    assert.equal(existsSync(join(r.config.evidenceRoot,'active-run.json')),false);
  }
  assert.equal(sourceState(),before);
});


test('memory constructor preserves nested jobs, restricted handles, breakaway refusal and kill-on-close', {skip:process.platform!=='win32'}, () => {
  const directory=mkdtempSync(join(tmpdir(),'dye-memory-containment-'));
  const probe=resolve('tests/fixtures/collab-supervisor/fake-job-probe.ps1');
  assert.equal(hash(readFileSync(probe)).toUpperCase(),'596FC6B855348D1800E4EF51D156A051C49404E0BD203064535DE35D2F2319A8');
  const fixture=resolve('tests/fixtures/collab-supervisor/fake-cli.mjs');
  assert.equal(hash(readFileSync(fixture)).toUpperCase(),'8001DAC8B3AECE12862DC8A8CA1ABA69338DF30205A145F0D1773669F606AB96');
  const script=join(directory,'memory-containment.ps1');
  writeFileSync(script,`param($Library,$Probe,$Node,$Fixture,$Directory,$PowerShell)
$ErrorActionPreference='Stop'
. $Library
$outerOut=New-Object DyeJobs.Capture
$outerErr=New-Object DyeJobs.Capture
$outer=New-Object DyeJobs.Process($Node,[string[]]@($Fixture,'hold'),$Directory,$outerOut,$outerErr)
try {
    # Test the existing private constructor; no new wire flag or runtime entry.
    $constructor=[DyeJobs.Process].GetConstructors([Reflection.BindingFlags]'Instance,NonPublic') | Where-Object {$_.GetParameters().Count -eq 10}
    if(@($constructor).Count -ne 1){throw 'Memory constructor test binding changed'}
    foreach($scenario in @('handles','breakaway','close')){
        $output=New-Object DyeJobs.Capture
        $errors=New-Object DyeJobs.Capture
        $record=Join-Path $Directory ($scenario+'.json')
        $argv=[string[]]@('-NoProfile','-ExecutionPolicy','Bypass','-File',$Probe,'-Library',$Library,
            '-J0',$outer.Job.ToInt64().ToString(),'-J1','__DYE_JOB_HANDLE__','-Output',$record)
        if($scenario -ceq 'breakaway'){$argv+=@('-Breakaway','-Node',$Node,'-Fixture',$Fixture,'-Spec','hold','-Scratch',$Directory)}
        $values=New-Object object[] 10
        $values[0]=$PowerShell;$values[1]=[string[]]$argv;$values[2]=$Directory
        $values[3]=$null;$values[4]=$null;$values[5]=$false;$values[6]=$outer.Job.ToInt64();$values[7]=$false
        $values[8]=$output.psobject.BaseObject;$values[9]=$errors.psobject.BaseObject
        if($scenario -ceq 'close'){$values[0]=$Node;$values[1]=[string[]]@($Fixture,'hold')}
        $child=$constructor.Invoke($values)
        try {
            $pidValue=$child.Pid;$created=$child.Created
            if(![DyeJobs.Process]::Member($pidValue,$outer.Job.ToInt64()) -or ![DyeJobs.Process]::Member($pidValue,$child.Job.ToInt64())){throw 'Memory child missing nested job membership'}
            if($scenario -ceq 'close'){
                $child.Dispose()
                $deadline=[DateTime]::UtcNow.AddSeconds(2)
                do {$observed=[DyeJobs.Process]::Inspect($pidValue);if(!$observed.Alive){break};Start-Sleep -Milliseconds 5}while([DateTime]::UtcNow -lt $deadline)
                if(!$observed.Known -or $observed.Alive){throw 'Closing memory job did not stop its child'}
                if(!$output.Abandoned -or !$errors.Abandoned){throw 'Close retained capture bytes'}
            }else{
                $deadline=[DateTime]::UtcNow.AddSeconds(8)
                while(!$child.Exited -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 5}
                if(!$child.Exited -or $child.ExitCode -ne 0){throw 'Memory probe did not complete'}
                if(!$child.WaitCaptures(1000)){throw 'Memory probe capture did not finish'}
                $result=Get-Content -LiteralPath $record -Raw | ConvertFrom-Json
                if($scenario -ceq 'handles'){
                    if($result.result -cne 'observed' -or $result.j0Inherited -or $result.j1Inherited){throw 'A job handle was inherited or observation failed'}
                }elseif($result.result -cne 'refused'){throw 'Breakaway was not refused'}
            }
        }finally{$child.Kill();$child.Dispose()}
    }
}finally{$outer.Kill();if(!$outer.IsEmpty()){Start-Sleep -Milliseconds 100};if(!$outer.IsEmpty()){throw 'Outer memory test job not empty'};$outer.Dispose()}
Write-Output 'PASS memory handles breakaway close'
`);
  const ps=join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const result=execFileSync(ps,['-NoProfile','-ExecutionPolicy','Bypass','-File',script,
    resolve('scripts/collab-supervisor/lib/windows-job.ps1'),probe,process.execPath,fixture,directory,ps],
  {encoding:'utf8',windowsHide:true,timeout:30000});
  assert.match(result,/PASS memory handles breakaway close/);
});

test('live request route and argv refusals happen before any process creation', {skip:process.platform!=='win32'}, () => {
  const root=mkdtempSync(join(tmpdir(),'dye-stage2-request-'));
  const script=join(root,'request-checks.ps1');
  writeFileSync(script,`param($Transport,$RootPath,$Node,$Fixture)
$ErrorActionPreference='Stop'
. $Transport
$rootCanonical=Get-DyeProbePath $RootPath
[void][IO.Directory]::CreateDirectory((Join-Path $RootPath 'raw'))
$nodeCanonical=Get-DyeProbePath $Node
$fixtureCanonical=Get-DyeProbePath $Fixture
$fixtureHash=Get-DyeProbeHash $Fixture
$nodeHash=Get-DyeProbeHash $Node
$manifestHash='A'*64
function RequestCase([string]$Operation,[string]$Mutation){
    $id=[guid]::NewGuid().ToString()
    $path=Join-Path $RootPath ($id+'.request.json')
    $canonical=$path.ToUpperInvariant()
    $template=Get-DyeLiveFixtureTemplate $Operation
    $sha=[Security.Cryptography.SHA256]::Create()
    try{$templateHash=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes((@($Operation,$template.route,$fixtureHash)+$template.args -join '|')))).Replace('-','')}finally{$sha.Dispose()}
    $deadline=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+5000
    $root=@{run_class='live-test';run_id='dye-live-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';registry_hash='B'*64;
        steps_dir=$rootCanonical;target_executable=$nodeCanonical;target_hash=$nodeHash;fixture=$fixtureCanonical;
        fixture_hash=$fixtureHash;cwd=$rootCanonical;probe_id=$Operation;deadline_utc=$deadline+1000}
    $row=@{schema=1;type='request';mode='live-nonmodel';run_class='live-test';run_id=$root.run_id;request_id=$id;
        probe_id=$Operation;template_hash=$templateHash;manifest_hash=$manifestHash;registry_hash=$root.registry_hash;
        executable=$nodeCanonical;executable_hash=$nodeHash;fixture=$fixtureCanonical;fixture_hash=$fixtureHash;cwd=$rootCanonical;
        output_route=$template.route;ready=$canonical+'.ready.json';done=$canonical+'.done.json';parent_pid=$PID;
        parent_created='1';step_ms=$template.timeoutMs;deadline_utc=$deadline;argv_count=$template.args.Count+1;argv_0000=$fixtureCanonical}
    for($i=0;$i -lt $template.args.Count;$i++){$row['argv_'+($i+1).ToString('D4')]=$template.args[$i]}
    if($template.route -ceq 'memory-shape'){$row.shape=$canonical+'.shape.json'}
    else{$row.stdout=(Join-Path (Join-Path $RootPath 'raw') ($Operation+'.out')).ToUpperInvariant();$row.stderr=(Join-Path (Join-Path $RootPath 'raw') ($Operation+'.err')).ToUpperInvariant()}
    switch($Mutation){
        'route' {$row.output_route=if($template.route -ceq 'file'){'memory-shape'}else{'file'}}
        'stdout' {$row.stdout=$canonical+'.stdout'}
        'stderr' {$row.stderr=$canonical+'.stderr'}
        'handle' {$row.argv_0001='__DYE_JOB_HANDLE__'}
        'environment' {$row.env_count=1;$row.env_0000_name='DYE_A5_OPERATOR';$row.env_0000_value='1'}
        'class' {$row.run_class='live-real'}
        'manifest' {$row.manifest_hash='C'*64}
        'registry' {$row.registry_hash='C'*64}
        'template' {$row.template_hash='C'*64}
        'executable' {$row.executable_hash='C'*64}
        'fixture' {$row.fixture_hash='C'*64}
        'run' {$row.run_id='dye-live-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'}
        'timeout' {$row.step_ms=$template.timeoutMs+1}
        'deadline' {$row.deadline_utc=$root.deadline_utc+1}
        'argv' {$row.argv_0001='unapproved-command'}
    }
    Write-DyeProbeWire $path $row 'live-nonmodel' | Out-Null
    if($Mutation -ceq 'mode'){
        # Deliberately corrupt the already written fixture; the strict writer
        # correctly refuses to construct a mixed-mode record itself.
        $text=[IO.File]::ReadAllText($path).Replace('"mode":"live-nonmodel"','"mode":"fake"')
        [IO.File]::WriteAllText($path,$text,[Text.UTF8Encoding]::new($false))
    }
    [IO.File]::WriteAllBytes($path+'.published',[byte[]]@())
    $failed=$false
    try{
        if($Mutation -ceq 'foreign-reader'){$accepted=Get-DyeProbeRequest $path $root $manifestHash}
        else{$accepted=Get-DyeLiveProbeRequest $path $root $manifestHash}
    }catch{$failed=$true}
    if(($Mutation -ceq 'none') -eq $failed){throw ('Unexpected request result: '+$Operation+'/'+$Mutation)}
    foreach($suffix in @('.ready.json','.done.json','.shape.json','.stdout','.stderr')){
        if(Test-Path -LiteralPath ($path+$suffix)){throw 'Refusal created a child/output record'}
    }
}
RequestCase 'auth' 'none'
RequestCase 'version' 'none'
foreach($mutation in @('route','handle','environment','class','manifest','registry','template','executable','fixture','run','timeout','deadline','argv','mode','foreign-reader')){
    RequestCase 'auth' $mutation
    RequestCase 'version' $mutation
}
RequestCase 'auth' 'stdout'
RequestCase 'auth' 'stderr'
Write-Output '34 request cases passed'
`);
  const ps=join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const result=execFileSync(ps,['-NoProfile','-ExecutionPolicy','Bypass','-File',script,
    resolve('scripts/collab-supervisor/lib/probe-transport.ps1'),root,process.execPath,
    resolve('tests/fixtures/collab-supervisor/fake-cli.mjs')],{encoding:'utf8',windowsHide:true,timeout:20000});
  assert.match(result,/34 request cases passed/);
});
