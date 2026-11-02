import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, linkSync, symlinkSync, copyFileSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync,spawn } from 'node:child_process';
import { canonicalWire, parseWire, pathTuple, systemPowerShellPath, writeWire, readWire, publishProbeRequest, indexed, reserveAttempt, probeMode } from '../scripts/collab-supervisor/lib/probe-contract.js';
import { syntheticAuth } from '../scripts/collab-supervisor/lib/auth.js';
import { Evidence } from '../scripts/collab-supervisor/lib/evidence.js';
import { newBudget } from '../scripts/collab-supervisor/lib/budget.js';
import { hash, realEligibility, regular } from '../scripts/collab-supervisor/lib/policy.js';
import { cliRepository,cli,fixtureGitExecutable } from './fixtures/collab-supervisor/cli-repository.js';
import { pathToFileURL } from 'node:url';
import { main } from '../scripts/collab-supervisor/supervisor.js';
import { psRuntime } from '../scripts/collab-supervisor/lib/fake-config.js';
import { randomUUID } from 'node:crypto';
const temp=()=>mkdtempSync(join(tmpdir(),'dye-probe-contract-'));
const psQuote=value=>"'"+value.replaceAll("'","''")+"'";
const wire={mode:'fake',schema:1,type:'vector'};

test('probe.live_gate: forged all-PASS eligibility cannot dispatch run, resume or probes',async()=>{
  const forged={phase:'B',bundle:'forged',versions:{v:'1'},approval:{phase:'B',bundle:'forged'},platform:{bundle:'forged',versions:{v:'1'},reviewed:true,required:[{result:'PASS'}]}};
  assert.equal(realEligibility(forged),true); // Legacy pure predicate only; no execution authority.
  for(const command of ['run','resume'])assert.throws(()=>main([command,JSON.stringify(forged)]),{code:'NOT_PLATFORM_ACCEPTED'});
  for(const mode of ['live','real','B',undefined])await assert.rejects(async()=>main(['platform-probes',mode,'run','--spec','C:\\DO-NOT-READ']),{code:'NOT_PLATFORM_ACCEPTED'});
  assert.throws(()=>probeMode('live'),{code:'NOT_PLATFORM_ACCEPTED'});
});
test('probe.strict_tokens: duplicates, ambiguous names, malformed types and framing refuse',()=>{
  for(const text of ['{"mode":"fake","mode":"fake"}\n','{"Argv":"x"}\n','{"\\u006dode":"fake"}\n','{"unknown":"x"}\n','{"schema":true}\n','{"schema":null}\n','{"schema":[]}\n','{"schema":{}}\n','{"schema":1.0}\n','{"schema":1e0}\n','{"schema":01}\n','{"schema":-0}\n','{"schema":9007199254740992}\n','{"type":"vector","mode":"fake"}\n','{"mode":"Fake"}\n','{"type":"VECTOR"}\n','{"argv_count":1}\n','{"argv_0001":"x","argv_count":1}\n','{"mode":"fa\\nke"}\n','{"mode":"faké"}\n','{"schema":1,}\n','{"schema":1}\n\n','\uFEFF{"schema":1}\n','{"schema":1}\r\n']){
    assert.throws(()=>parseWire(Buffer.from(text),{paths:false}),undefined,text);
  }
  assert.throws(()=>parseWire(Buffer.from([0xff,0x0a])));
  assert.deepEqual({...parseWire(canonicalWire(wire),{paths:false})},wire);
});
test('probe.paths: ambiguous, linked, short and missing paths are refused before contents',()=>{
  const root=temp(),file=join(root,'input.json');writeFileSync(file,'synthetic');
  assert.equal(pathTuple(file),file.toUpperCase());
  const linked=join(root,'linked.json');linkSync(file,linked);assert.throws(()=>pathTuple(file));assert.throws(()=>pathTuple(linked));
  for(const path of ['C:relative','relative','\\\\server\\share','\\\\?\\C:\\x','C:\\a\\..\\b','C:\\a.\\b','C:\\a \\b','C:\\a:b','C:\\FOO~1\\x',join(root,'missing','x')])assert.throws(()=>pathTuple(path),undefined,path);
  assert.equal(pathTuple(join(root,'future.json'),{output:true}),join(root,'future.json').toUpperCase());
});
test('probe.exclusive_wire: identity hashes, exclusive receipts and indexed argv bindings',()=>{
  const root=temp(),path=join(root,'vector.json');const row={...wire,...indexed('argv',['x','quote"slash\\'])};
  const sealed=writeWire(path,row);assert.equal(sealed,hash(readFileSync(path)));
  assert.deepEqual({...readWire(path,sealed,{paths:false})},row);
  assert.throws(()=>writeWire(path,row));assert.throws(()=>readWire(path,'0'.repeat(64)));
  const request=join(root,'request.json');publishProbeRequest(request,row);
  assert.equal(readFileSync(request+'.published').length,0);assert.deepEqual({...readWire(request)},row);
  const partial=join(root,'partial.json');writeFileSync(partial,'{');
  assert.throws(()=>publishProbeRequest(partial,row));assert.equal(existsSync(partial+'.published'),false);
});
test('probe.reservation: fsynced intent consumes cap through failure, reload and replay',()=>{
  const root=temp(),evidence=new Evidence(root),attempts=[],budget=newBudget(100,1000);
  const args={budget,attempts,cap:1,requestId:'one',probeId:'version',now:101,binding:'fixed'};
  reserveAttempt(evidence,args);assert.equal(attempts.length,1);
  assert.throws(()=>reserveAttempt(evidence,args));assert.throws(()=>reserveAttempt(evidence,{...args,requestId:'two'}));
  // A new process cannot reuse an exclusive reservation file even with empty memory.
  assert.throws(()=>reserveAttempt(new Evidence(root),{...args,attempts:[]}));
  assert.throws(()=>reserveAttempt(evidence,{...args,attempts:[],requestId:'expired',now:1101}),{code:'TIMEOUT'});
  const broken=new Evidence(temp(),{inject:step=>{if(step==='flush')throw new Error('injected disk failure');}}),none=[];
  assert.throws(()=>reserveAttempt(broken,{...args,attempts:none,requestId:'disk'}),{code:'EVIDENCE_WRITE'});assert.equal(none.length,0);
});
test('probe.auth: validate source before redacting, no raw privacy fields survive',()=>{
  const valid={schema:1,source:'fixture-subscription',mode:'subscription',authenticated:true,exit:0,timeout:false};
  assert.deepEqual(syntheticAuth(valid),{schema:1,mode:'synthetic-subscription',exit:0});
  for(const delta of [{source:'api-key'},{source:'unknown'},{mode:'console'},{authenticated:false},{exit:1},{timeout:true},{email:'do-not-retain@example.invalid'},{token:'do-not-retain'}])assert.throws(()=>syntheticAuth({...valid,...delta}),{code:'AUTH_OR_USAGE'});
});
test('probe.setup: plan is data, apply refuses and does not create setup paths',{skip:process.platform!=='win32'},()=>{
  const script=resolve('scripts/collab-supervisor/acceptance/platform-setup.ps1');
  const plan=JSON.parse(execFileSync(psRuntime(),['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-Action','Plan'],{encoding:'utf8',windowsHide:true}));
  assert.equal(plan.applied,false);assert.equal(plan.realResults,'UNVERIFIED');
  assert.throws(()=>execFileSync(psRuntime(),['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-Action','Apply'],{windowsHide:true,stdio:'pipe'}));
});
test('probe.cross_language: identical adversarial bytes and typed tuples in Windows PowerShell 5.1',{skip:process.platform!=='win32'},()=>{
  const root=temp(),valid=join(root,'regular.json');writeFileSync(valid,'own test data');
  const corpus=[canonicalWire(wire),canonicalWire({...wire,cwd:root,fixture:valid,parent_created:'134000000000000000',...indexed('argv',['x','\\"'])}),
    ...['{"schema":1,"schema":2}\n','{"schema":true}\n','{"schema":9007199254740992}\n','{"schema":-0}\n','{"schema":1e1}\n','{"mode":"Fake"}\n','{"Argv":"x"}\n','{"\\u006dode":"fake"}\n','{"env_count":1}\n','{"schema":1,}\n','\uFEFF{"schema":1}\n','{"schema":1}\r\n','{"unknown":"x"}\n','{"mode":[]}\n','{"mode":null}\n','{"mode":{}}\n','{"mode":"faké"}\n','{"type":"vector","schema":1}\n','{"schema":1}\nextra'].map(s=>Buffer.from(s)),
    ...['C:relative','C:\\a\\..\\b','C:\\FOO~1\\x','C:\\a.\\x','C:\\a \\x','C:\\a:b','\\\\server\\share','\\\\?\\C:\\x',join(root,'missing','x')].map(cwd=>canonicalWire({...wire,cwd}))];
  const hard=join(root,'hard.json');linkSync(valid,hard);corpus.push(canonicalWire({...wire,fixture:hard}));
  const junction=join(root,'junction');symlinkSync(root,junction,'junction');corpus.push(canonicalWire({...wire,cwd:junction}));
  // The valid existing-file vector uses a separate single-link file.
  const single=join(root,'single.json');writeFileSync(single,'own data');corpus[1]=canonicalWire({...wire,cwd:root,fixture:single,parent_created:'134000000000000000',...indexed('argv',['x','\\"'])});
  corpus.forEach((bytes,i)=>writeFileSync(join(root,String(i)+'.wire'),bytes));
  const driver=join(root,'validate.ps1'),validator=resolve('scripts/collab-supervisor/lib/probe-transport.ps1');
  writeFileSync(driver,`. ${psQuote(validator)}\n$rows=@();for($i=0;$i -lt ${corpus.length};$i++){try{$row=Read-DyeProbeWire (Join-Path $PSScriptRoot ($i.ToString()+'.wire'));$rows+=@{ok=$true;row=$row}}catch{$rows+=@{ok=$false}}};ConvertTo-Json -InputObject $rows -Depth 8 -Compress\n`);
  const actual=JSON.parse(execFileSync(psRuntime(),['-NoProfile','-ExecutionPolicy','Bypass','-File',driver],{windowsHide:true,encoding:'utf8',timeout:30000}));
  for(let i=0;i<corpus.length;i++){
    let expected;try{expected={ok:true,row:{...parseWire(corpus[i])}};}catch{expected={ok:false};}
    assert.deepEqual(actual[i],expected,'vector '+i);
  }
  assert.equal(actual[0].ok,true);assert.equal(actual[1].ok,true);assert.ok(actual.slice(2).every(row=>!row.ok));
});

test('probe.broker_wrapper: consumed IDs, actual parent, current lock and independent receipts fail closed',{skip:process.platform!=='win32'},()=>{
  const root=temp(),repository=join(root,'repository'),steps=join(root,'spool');mkdirSync(repository);mkdirSync(steps);
  writeFileSync(join(repository,'.dye-supervisor-fake.json'),'{}');
  const config=join(root,'config.json'),transport=join(root,'transport.json');writeFileSync(config,'{}');writeFileSync(transport,'{}');
  const fixture=resolve('tests/fixtures/collab-supervisor/fake-agent.js'),coordinator=resolve('scripts/collab-supervisor/coordinator.js');
  const gitExecutable=fixtureGitExecutable({singleLink:true});assert.ok(gitExecutable);
  const manifest=join(root,'manifest.json'),now=Date.now(),marker='dye-fake-'+randomUUID();
  const manifestHash=writeWire(manifest,{schema:1,type:'manifest',mode:'fake',run_id:marker,registry_hash:'A'.repeat(64),approval_hash:'B'.repeat(64),
    config_path:config,config_hash:hash(readFileSync(config)),transport_path:transport,transport_hash:hash(readFileSync(transport)),repository,
    executable:process.execPath,executable_hash:hash(readFileSync(process.execPath)),fixture:coordinator,fixture_hash:hash(readFileSync(coordinator)),agent_fixture:fixture,
    powershell_executable:psRuntime(),powershell_hash:hash(readFileSync(psRuntime())),git_executable:gitExecutable,git_hash:hash(readFileSync(gitExecutable)),
    cwd:root,stdout:join(root,'stdout'),stderr:join(root,'stderr'),ready:join(root,'ready'),done:join(root,'done'),steps_dir:steps,
    total_ms:120000,grace_ms:1000,deadline_utc:now+120000,started_at:now,marker,owner_stop:join(root,'owner-stop'),lock_path:join(root,'lock.json'),...indexed('argv',[]),...indexed('env',[])});
  const library=resolve('scripts/collab-supervisor/lib/probe-transport.ps1'),jobs=resolve('scripts/collab-supervisor/lib/windows-job.ps1');
  const driver=join(root,'negative.ps1');
  writeFileSync(driver,`
$ErrorActionPreference='Stop'
. ${psQuote(jobs)}
. ${psQuote(library)}
Import-Module (Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\Modules\\CimCmdlets\\CimCmdlets.psd1')
$root=Get-DyeProbeRoot ${psQuote(manifest)} 'fake' '${manifestHash}'
$self=Get-CimInstance -Query "SELECT ProcessId,ParentProcessId,CreationDate FROM Win32_Process WHERE ProcessId=$PID"
$parent=[int]$self.ParentProcessId;$parentCreated=[DyeJobs.Process]::CreationTime($parent).ToString()
$coordinator=@{Pid=$parent;Created=[long]$parentCreated}
$results=@()
function Expect-Refusal([string]$Name,[scriptblock]$Action,[string]$Pattern){
 try{& $Action;throw 'UNEXPECTED SUCCESS'}catch{if($_.Exception.Message -eq 'UNEXPECTED SUCCESS' -or $_.Exception.Message -notmatch $Pattern){throw};$script:results+=@{name=$Name;result='PASS'}}
}
function Put-Lock([int]$Launcher,[string]$Created){
 @{runId=$root['run_id'];node=@{pid=$parent;createdAt=$parentCreated};launcher=@{pid=$Launcher;createdAt=$Created}} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $root['lock_path'] -Encoding UTF8
}
function Request([string]$Id){
 $path=Join-Path $root['steps_dir'] ($Id+'.request.json')
 $row=@{schema=1;type='request';mode='fake';run_id=$root['run_id'];request_id=$Id;probe_id='version';manifest_hash='${manifestHash}';registry_hash=$root['registry_hash'];executable=$root['executable'];executable_hash=$root['executable_hash'];fixture=$root['agent_fixture'];fixture_hash=(Get-DyeProbeHash $root['agent_fixture']);cwd=$root['repository'];stdout=($path+'.stdout');stderr=($path+'.stderr');ready=($path+'.ready.json');done=($path+'.done.json');release=($path+'.release');parent_pid=$parent;parent_created=$parentCreated;step_ms=100000;deadline_utc=([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+90000);argv_count=4;argv_0000='${fixture.replaceAll('\\','\\\\').replaceAll("'","''")}';argv_0001='probe-version';argv_0002=('--dye-run-marker='+$root['marker']);argv_0003=('--release-file='+$path+'.release')}
 # argv_0000 above is a Windows path literal; take its independently validated typed spelling.
 $row['argv_0000']=$root['agent_fixture'].Substring(0,$root['agent_fixture'].Length-3)+'.js'
 Write-DyeProbeWire $path $row;[IO.File]::WriteAllText($path+'.published','');return $path
}
$partial=Join-Path $root['steps_dir'] 'unfinished.request.json';[IO.File]::WriteAllText($partial,'{')
Expect-Refusal 'unfinished_request_not_read' {Get-DyeProbeRequest $partial $root '${manifestHash}'} 'Request not published'
$first=Request '00000000-0000-4000-8000-000000000001'
Expect-Refusal 'missing_lock' {New-DyeProbeConsumption $first $root '${manifestHash}' $coordinator} 'lock.json|find|exist'
Put-Lock $PID ([DyeJobs.Process]::CreationTime($PID).ToString())
$made=New-DyeProbeConsumption $first $root '${manifestHash}' $coordinator
if(-not (Test-Path -LiteralPath $made.consume)){throw 'Consumption was not durable'}
Expect-Refusal 'broker_replay' {New-DyeProbeConsumption $first $root '${manifestHash}' $coordinator} 'exist'
Expect-Refusal 'actual_parent_not_claim' {Confirm-DyeProbeStart $first ${psQuote(manifest)} '${manifestHash}' $made.consume} 'Actual parent'
Expect-Refusal 'direct_wrapper_without_consumption' {Confirm-DyeProbeStart $first ${psQuote(manifest)} '${manifestHash}' ($first+'.foreign')} 'Consumption path'
Expect-Refusal 'foreign_manifest_hash' {Get-DyeProbeRequest $first $root ('F'*64)} 'binding'
$bad=Read-DyeProbeWire $first;$bad['run_id']='dye-fake-00000000-0000-4000-8000-000000000009'
$foreign=Request '00000000-0000-4000-8000-000000000002'
$foreignRow=Read-DyeProbeWire $foreign;$foreignRow['run_id']=$bad['run_id']
$swapped=$foreign+'.swap';Write-DyeProbeWire $swapped $foreignRow
[IO.File]::WriteAllBytes($foreign,[IO.File]::ReadAllBytes($swapped))
Expect-Refusal 'foreign_run' {Get-DyeProbeRequest $foreign $root '${manifestHash}'} 'binding'
Expect-Refusal 'wrong_coordinator' {New-DyeProbeConsumption $first $root '${manifestHash}' @{Pid=$PID;Created=[DyeJobs.Process]::CreationTime($PID)}} 'Coordinator identity'
# A complete, bound consumption for this actual parent's identity lets validation
# reach the exclusive wrapper receipt. It does not create a child process.
Put-Lock $parent $parentCreated
$second=Request '00000000-0000-4000-8000-000000000003'
$request=Read-DyeProbeWire $second
$consumption=@{schema=1;type='consumption';mode='fake';run_id=$root['run_id'];request_id=$request['request_id'];probe_id='version';manifest_hash='${manifestHash}';request_hash=(Get-DyeProbeHash $second);registry_hash=$root['registry_hash'];launcher_pid=$parent;launcher_created=$parentCreated;coordinator_pid=$parent;coordinator_created=$parentCreated;deadline_utc=$request['deadline_utc']}
Write-DyeProbeWire ($second+'.consumed.json') $consumption
$validated=Confirm-DyeProbeStart $second ${psQuote(manifest)} '${manifestHash}' ($second+'.consumed.json')
if($validated.args[1] -cne 'probe-version' -or -not (Test-Path -LiteralPath ($second+'.started.json'))){throw 'Wrapper receipt missing'}
$results+=@{name='valid_wrapper_receipt_without_child';result='PASS'}
Expect-Refusal 'second_wrapper' {Confirm-DyeProbeStart $second ${psQuote(manifest)} '${manifestHash}' ($second+'.consumed.json')} 'exist'
Put-Lock $parent '1'
Expect-Refusal 'changed_current_lock' {Confirm-DyeProbeStart $second ${psQuote(manifest)} '${manifestHash}' ($second+'.consumed.json')} 'lock mismatch'
Put-Lock $parent $parentCreated
$third=Request '00000000-0000-4000-8000-000000000004';$thirdRow=Read-DyeProbeWire $third
$old=@{};foreach($key in $consumption.Keys){$old[$key]=$consumption[$key]}
$old['request_id']=$thirdRow['request_id'];$old['request_hash']=Get-DyeProbeHash $third;$old['deadline_utc']=$thirdRow['deadline_utc'];$old['launcher_created']='1'
Write-DyeProbeWire ($third+'.consumed.json') $old
Expect-Refusal 'reused_launcher_pid' {Confirm-DyeProbeStart $third ${psQuote(manifest)} '${manifestHash}' ($third+'.consumed.json')} 'Actual parent'
$changed=Read-DyeProbeWire $second;$changed['argv_0001']='probe-auth'
$swap=$second+'.swap';Write-DyeProbeWire $swap $changed
[IO.File]::WriteAllBytes($second,[IO.File]::ReadAllBytes($swap))
Expect-Refusal 'swapped_after_consumption' {Confirm-DyeProbeStart $second ${psQuote(manifest)} '${manifestHash}' ($second+'.consumed.json')} 'argv|changed'
ConvertTo-Json -InputObject $results -Compress
`);
  const rows=JSON.parse(execFileSync(psRuntime(),['-NoProfile','-ExecutionPolicy','Bypass','-File',driver],{encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,DYE_SUPERVISOR_TEST:'1'}}));
  assert.equal(rows.length,13);assert.ok(rows.every(row=>row.result==='PASS'));
  assert.equal(existsSync(join(root,'stdout')),false); // Validation never reached any child creation.
});

test('probe.concurrent_receipts: two independent PowerShell writers yield one durable winner',{skip:process.platform!=='win32'},async()=>{
  const root=temp(),receipt=join(root,'receipt.json'),driver=join(root,'exclusive.ps1');
  writeFileSync(driver,`. ${psQuote(resolve('scripts/collab-supervisor/lib/probe-transport.ps1'))}\ntry{Write-DyeProbeWire ${psQuote(receipt)} @{mode='fake';schema=1;type='vector'};exit 0}catch{exit 83}\n`);
  const writer=()=>new Promise((done,reject)=>{const child=spawn(psRuntime(),['-NoProfile','-ExecutionPolicy','Bypass','-File',driver],{windowsHide:true,stdio:'pipe'});child.on('error',reject);child.on('close',done);});
  assert.deepEqual((await Promise.all([writer(),writer()])).sort((a,b)=>a-b),[0,83]);
  assert.deepEqual({...readWire(receipt)},wire);
});
test('probe.legacy_entry: probe-like JSON fields cannot select the sealed launcher route',{skip:process.platform!=='win32'},()=>{
  const root=temp(),fixture=resolve('tests/fixtures/collab-supervisor/fake-agent.js');
  const spec=join(root,'legacy.json'),done=join(root,'done.json'),stdout=join(root,'stdout');
  writeFileSync(spec,JSON.stringify({kind:'fake',executable:process.execPath,fixture,fixtureHash:hash(readFileSync(fixture)),args:[fixture,'probe-version'],cwd:root,stdout,stderr:join(root,'stderr'),ready:join(root,'ready.json'),done,totalMs:5000,graceMs:1000,
    probeMode:'live',manifestHash:'F'.repeat(64),manifestPath:'C:\\DO-NOT-LOOK-UP',consumptionPath:'C:\\DO-NOT-READ'}));
  execFileSync(psRuntime(),['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve('scripts/collab-supervisor/launch.ps1'),'-SpecPath',spec,'-TestHarness'],{windowsHide:true,timeout:15000,env:{...process.env,DYE_SUPERVISOR_TEST:'1'},stdio:'pipe'});
  assert.equal(JSON.parse(readFileSync(stdout,'utf8')).version,'fixture-v1');
  const ended=JSON.parse(readFileSync(done,'utf8').replace(/^\uFEFF/,''));assert.equal(ended.empty,true);assert.equal(ended.exit,0);
});

// Amendment corpus: expected outcomes are explicit, not inferred from one parser.
// Both implementations consume the same retained byte files. No fixture is run.
function amendmentCorpus(rows) {
  const root=temp(),library=resolve('scripts/collab-supervisor/lib/probe-transport.ps1');
  rows.forEach((row,i)=>writeFileSync(join(root,i+'.wire'),Buffer.isBuffer(row)?row:canonicalWire(row)));
  const driver=join(root,'roles.ps1');
  writeFileSync(driver,`. ${psQuote(library)}\n$rows=@();for($i=0;$i -lt ${rows.length};$i++){try{$row=Read-DyeProbeWire (Join-Path $PSScriptRoot ($i.ToString()+'.wire'));$rows+=@{allowed=$true;row=$row}}catch{$rows+=@{allowed=$false}}};ConvertTo-Json -InputObject $rows -Depth 8 -Compress\n`);
  const ps=JSON.parse(execFileSync(psRuntime(),['-NoProfile','-ExecutionPolicy','Bypass','-File',driver],{encoding:'utf8',windowsHide:true,timeout:30000}));
  const js=rows.map((_,i)=>{try{return {allowed:true,row:{...parseWire(readFileSync(join(root,i+'.wire')))}};}catch{return {allowed:false};}});
  assert.deepEqual(ps,js);return js;
}
const psVector=()=>({...wire,powershell_executable:psRuntime(),powershell_hash:hash(readFileSync(psRuntime()))});
function linkedSample(name='sample.exe') {
  const root=temp(),file=join(root,name);writeFileSync(file,'Synthetic linked sample; never executable.');linkSync(file,join(root,'second-name'));
  return {root,file};
}
test('amendment.1: fixed system PowerShell role accepts the real linked binary in both languages',{skip:process.platform!=='win32'},()=>{
  assert.equal(systemPowerShellPath(),psRuntime());assert.ok(lstatSync(psRuntime()).nlink>=1);
  const [result]=amendmentCorpus([psVector()]);assert.equal(result.allowed,true);assert.equal(result.row.powershell_executable,psRuntime().toUpperCase());
  console.log(JSON.stringify({case:'amendment.1',systemPowerShellLinks:lstatSync(psRuntime()).nlink}));
});
test('amendment.2: a linked Temp file cannot select the PowerShell exception',{skip:process.platform!=='win32'},()=>{
  const {file}=linkedSample('powershell.exe');const [result]=amendmentCorpus([{...psVector(),powershell_executable:file,powershell_hash:hash(readFileSync(file))}]);
  assert.equal(result.allowed,false);
});
test('amendment.3: system PowerShell in every other path field and generic validators is refused',{skip:process.platform!=='win32'},()=>{
  const fields=['executable','fixture','agent_fixture','config_path','transport_path','git_executable','cwd','stdout','stderr','ready','done','steps_dir','owner_stop','lock_path','consume_path','receipt_path','manifest_path','release','repository'];
  assert.ok(amendmentCorpus(fields.map(key=>({...wire,[key]:psRuntime()}))).every(row=>!row.allowed));
  assert.throws(()=>pathTuple(psRuntime()));
  const root=temp(),driver=join(root,'strict.ps1');
  writeFileSync(driver,`. ${psQuote(resolve('scripts/collab-supervisor/lib/probe-transport.ps1'))}\ntry{Get-DyeProbePath ${psQuote(psRuntime())};exit 9}catch{Write-Output 'strict-refusal'}\n`);
  assert.match(execFileSync(psRuntime(),['-NoProfile','-ExecutionPolicy','Bypass','-File',driver],{encoding:'utf8',windowsHide:true}),/strict-refusal/);
});
test('amendment.4: all linked control fields and control input files stay strict',{skip:process.platform!=='win32'},()=>{
  const {root,file}=linkedSample('control.json');
  const fields=['config_path','transport_path','executable','fixture','cwd','stdout','stderr','ready','done','steps_dir','owner_stop','agent_fixture','lock_path','consume_path','receipt_path','manifest_path','release','repository','git_executable'];
  assert.ok(amendmentCorpus(fields.map(key=>({...wire,[key]:file}))).every(row=>!row.allowed));
  const paths=[];
  for(const name of ['manifest','request','consumption','receipt','approval','config','transport']){const p=join(root,name+'.json');writeFileSync(p,canonicalWire(wire));linkSync(p,p+'.alias');paths.push(p);assert.throws(()=>readWire(p));}
  const driver=join(root,'inputs.ps1');
  writeFileSync(driver,`. ${psQuote(resolve('scripts/collab-supervisor/lib/probe-transport.ps1'))}\n$paths=@(${paths.map(psQuote).join(',')});foreach($p in $paths){try{Read-DyeProbeWire $p;exit 9}catch{}};Write-Output 'all-control-inputs-refused'\n`);
  assert.match(execFileSync(psRuntime(),['-NoProfile','-ExecutionPolicy','Bypass','-File',driver],{windowsHide:true,encoding:'utf8'}),/all-control-inputs-refused/);
});
test('amendment.5: Node and Git role samples with multiple links receive no runtime exception',{skip:process.platform!=='win32'},()=>{
  const root=temp(),source=join(root,'synthetic-runtime');writeFileSync(source,'Synthetic runtime bytes, not installed tools.');const rows=[];
  for(const [name,key] of [['node.exe','executable'],['git.exe','git_executable']]){
    const copy=join(root,name);copyFileSync(source,copy);linkSync(copy,copy+'.alias');rows.push({...wire,[key]:copy});
  }
  assert.ok(amendmentCorpus(rows).every(row=>!row.allowed));
  const prerequisite=fixtureGitExecutable({singleLink:true});
  assert.equal(lstatSync(prerequisite).nlink,1);
  assert.equal(hash(readFileSync(prerequisite)),hash(readFileSync(fixtureGitExecutable())));
});
test('amendment.6: changed expected PowerShell hash refuses at the pre-dispatch validation boundary',{skip:process.platform!=='win32'},()=>{
  const row={...psVector(),powershell_hash:'F'.repeat(64)};let childCreated=false;
  assert.throws(()=>{parseWire(canonicalWire(row));childCreated=true;});assert.equal(childCreated,false);
  assert.equal(amendmentCorpus([row])[0].allowed,false);
  // Actual CLI approval-to-launch drift is also covered by the acceptance suite's
  // changed expected runtime pins test, which checks no run reservation/launcher.
});
test('amendment.7: role/path aliases and attempted exception flags fail the shared grammar and path check',{skip:process.platform!=='win32'},()=>{
  const expected=psRuntime();const rows=[
    ...[expected.toUpperCase(),expected.replaceAll('\\','/'),expected.replace('System32','System32.'),expected+':stream',expected.replace('System32','System32\\..\\System32'),'\\\\?\\'+expected,'\\\\localhost\\C$\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'].map(path=>({...psVector(),powershell_executable:path})),
    Buffer.from(JSON.stringify({...wire,Powershell_executable:expected,powershell_hash:psVector().powershell_hash})+'\n'),
    Buffer.from(JSON.stringify({...wire,powershell_executable_alias:expected})+'\n'),
    Buffer.from('{"mode":"fake","powershell\\u005fexecutable":"x","schema":1,"type":"vector"}\n'),
    ...[{...psVector(),allow_hardlinks:'1'},{...psVector(),runtime_role:'powershell_executable'}].map(row=>Buffer.from(JSON.stringify(Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])))+'\n'))
  ];
  const {root}=linkedSample();const junction=join(root,'alias');symlinkSync(resolve(expected,'..'),junction,'junction');
  rows.push({...psVector(),powershell_executable:join(junction,'powershell.exe')});
  assert.ok(amendmentCorpus(rows).every(row=>!row.allowed));
  assert.throws(()=>pathTuple(expected,{allowHardlinks:true,role:'powershell_executable'}));
});
test('amendment.8: unchanged legacy regular-file fixture guard rejects multiple links',{skip:process.platform!=='win32'},()=>{
  const {file}=linkedSample('fake-agent.js');assert.throws(()=>regular(file),{code:'INTEGRITY'});
  // PowerShell's legacy fake-fixture wire fields never acquire the role exception.
  assert.equal(amendmentCorpus([{...wire,fixture:file}])[0].allowed,false);
});
test('amendment.9 A1: spoofed SystemRoot is refused by prepare, Node and the OS-anchored PowerShell validator',{skip:process.platform!=='win32'},()=>{
  const r=cliRepository({probes:{ids:['version'],cap:1}}),fakeRoot=join(r.root,'fake-windows'),directory=join(fakeRoot,'System32','WindowsPowerShell','v1.0');mkdirSync(directory,{recursive:true});
  const fake=join(directory,'powershell.exe');writeFileSync(fake,'Synthetic non-executable sample.');linkSync(fake,fake+'.alias');
  const guarded=join(r.root,'node-guard.mjs'),module=pathToFileURL(resolve('scripts/collab-supervisor/lib/probe-contract.js')).href;
  writeFileSync(guarded,`import {systemPowerShellPath} from ${JSON.stringify(module)};try{systemPowerShellPath();process.exitCode=9;}catch(e){console.log(e.message);}`);
  const env={...process.env,SystemRoot:fakeRoot,DYE_SUPERVISOR_TEST:'1',DYE_A5_OPERATOR:'0'};
  assert.match(execFileSync(process.execPath,[guarded],{env,encoding:'utf8',windowsHide:true}),/Untrusted system PowerShell location/);
  const prepared=spawnSyncResult(process.execPath,[cli,'platform-probes','fake','prepare','--spec',r.path],env);
  assert.notEqual(prepared.exit,0);assert.match(prepared.stderr,/Untrusted system PowerShell location/);
  assert.equal(existsSync(join(r.config.evidenceRoot,'approvals.jsonl')),false);assert.equal(existsSync(join(r.config.evidenceRoot,'active-run.json')),false);
  const driver=join(r.root,'os-anchor.ps1');
  // Set SystemRoot only inside this test-owned child, after loading the metadata
  // helper. Native SystemDirectory remains an independent OS value.
  writeFileSync(driver,`. ${psQuote(resolve('scripts/collab-supervisor/lib/probe-transport.ps1'))}\n$env:SystemRoot=${psQuote(fakeRoot)}\ntry{Get-DyeSystemPowerShellPath;exit 9}catch{Write-Output $_.Exception.Message}\n`);
  assert.match(execFileSync(psRuntime(),['-NoProfile','-ExecutionPolicy','Bypass','-File',driver],{encoding:'utf8',windowsHide:true}),/SystemRoot does not match OS system directory/);
  assert.equal(existsSync(join(r.config.evidenceRoot,'probe-run-reserved.json')),false);
});
function spawnSyncResult(executable,args,env){
  try{return {exit:0,stdout:execFileSync(executable,args,{env,windowsHide:true,encoding:'utf8',stdio:'pipe'}),stderr:''};}
  catch(error){return {exit:error.status,stdout:String(error.stdout),stderr:String(error.stderr)};}
}
