import test from 'node:test';
import { bindInventoryApproval, INVENTORY_TEMPLATES, inventoryRegistryHash } from '../scripts/collab-supervisor/lib/probe-contract.js';
import assert from 'node:assert/strict';
import { liveProbeCommand, compareInventoryObservations, buildStage2Result, scanInventoryOutput, inventoryPublication, publishInventoryArtifacts, recordStage2Failure, appendStage2Journal } from '../scripts/collab-supervisor/lib/live-probes.js';
import { validateAuthProjection, applyAuthSchema } from '../scripts/collab-supervisor/lib/auth.js';
import { networkTarget, payloadTargets, runNetworkProbe } from '../scripts/collab-supervisor/acceptance/stage2-probe-payload.mjs';

test('stage2 payload target policy is closed and network checks are data-only', () => {
  assert.deepEqual(networkTarget('dns','github.com'),{kind:'dns',target:'github.com'});
  assert.deepEqual(networkTarget('https-head','https://github.com/'),{kind:'https-head',target:'https://github.com/'});
  assert.deepEqual(networkTarget('tcp','127.0.0.1:5087'),{kind:'tcp',host:'127.0.0.1',port:5087});
  for (const [kind,target] of [['dns','example.com'],['dns','github.com.'],['https-head','http://github.com/'],
    ['https-head','https://github.com/private'],['https-head','https://user@github.com/'],['tcp','localhost:80'],
    ['tcp','127.0.0.1:0'],['tcp','127.0.0.1:65536'],['tcp','127.0.0.1:080'],['get','https://github.com/']])
    assert.throws(()=>networkTarget(kind,target),{code:'PAYLOAD_REFUSED'});
  const nonce='a'.repeat(32),id='dye-live-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const root='C:\\Projects\\dye-ledger-stage2-wt-'+id;
  const policy=payloadTargets(root,nonce,false,id);
  assert.equal(policy.reads.length,6);assert.equal(policy.creates.length,12);assert.equal(policy.renames.length,3);
  assert.ok(policy.reads.every(path=>path.endsWith('sentinel.txt')||path.endsWith('.env.wp-auto-sentinel')));
  assert.ok(policy.creates.every(path=>path.endsWith('.canary')&&!path.endsWith('pre-commit')));
  assert.ok(policy.renames.every(path=>path.includes(id)));
  assert.throws(()=>payloadTargets(root,'b'.repeat(32),false,id),{code:'PAYLOAD_REFUSED'});
  assert.throws(()=>payloadTargets('C:\\Projects\\JJL-Golf-App',nonce,false,id),{code:'PAYLOAD_REFUSED'});
});

test('stage2 auth evidence accepts only vocabulary and redacted classes, and never infers an auth mode', () => {
  const projection = { authMode: 'UNVERIFIED (bootstrap)', loggedIn: 'UNVERIFIED (bootstrap)', schema: null,
    shape: {fields:[['email','<redacted:len=23,class=email-like>'],['mode','subscription']]} };
  assert.match(validateAuthProjection(projection).projectionHash,/^[A-F0-9]{64}$/);
  for(const change of [
    {...projection, authMode:'subscription'}, {...projection, schema:{accepted:true}},
    {...projection, shape:{fields:[['email','private@example.invalid']]}},
    {...projection, shape:{fields:[['private@example.invalid','subscription']]}},
    {stop:'TOKEN_LIKE',shape:projection.shape}, {stop:'UNKNOWN'}
  ]) assert.throws(()=>validateAuthProjection(change),{code:'AUTH_OR_USAGE'});
  assert.match(validateAuthProjection({stop:'TOKEN_LIKE'}).projectionHash,/^[A-F0-9]{64}$/);
  assert.match(validateAuthProjection({stop:'TOKEN_LIKE',hitClass:'SECRET_PREFIX',jsonPathOrLineNo:2}).projectionHash,/^[A-F0-9]{64}$/);
  for (const details of [
    {hitClass:'raw-secret-value',jsonPathOrLineNo:1},
    {hitClass:'SECRET_PREFIX',jsonPathOrLineNo:'private-key-path'},
    {hitClass:'SECRET_PREFIX',jsonPathOrLineNo:0}
  ]) assert.throws(()=>validateAuthProjection({stop:'TOKEN_LIKE',...details}),{code:'AUTH_OR_USAGE'});
  assert.throws(()=>applyAuthSchema(projection),/separate review/);
  assert.throws(()=>applyAuthSchema(projection,{rules:[{mode:'subscription'}]}),/not accepted/);
});

test('stage2 result projection refuses fixture evidence and never promotes bootstrap auth to platform acceptance', () => {
  const input = {mode:'live-nonmodel',run_class:'live-real',operation:'l-a',inventoryRegistryHash,
    shape:{mode:'live-nonmodel',run_class:'live-real',exitCode:0,stdoutTotal:18,stderrTotal:0,durationMs:10,projection:{authMode:'UNVERIFIED (bootstrap)',
      loggedIn:'UNVERIFIED (bootstrap)',schema:null,shape:{fields:[['loggedIn',true]]}}}};
  const result = buildStage2Result(input);
  assert.equal(result.status,'OBSERVED (shape only)');
  assert.equal(result.platformAcceptance,'UNVERIFIED');
  assert.equal(result.authMode,'UNVERIFIED (bootstrap)');
  const {shapeHash,...safeRecord}=result;
  assert.equal(shapeHash,hash(JSON.stringify(safeRecord)));
  assert.notEqual(buildStage2Result({...input,shape:{...input.shape,durationMs:11}}).shapeHash,shapeHash);
  input.shape.projection.shape.fields[0][1]=false;
  assert.equal(result.projection.shape.fields[0][1],true);
  for (const change of [{run_class:'live-test'},{mode:'fake'},{operation:'payload-identity'},{inventoryRegistryHash:'0'.repeat(64)}])
    assert.throws(()=>buildStage2Result({...input,...change}),{code:'NOT_APPROVED'});
  assert.throws(()=>buildStage2Result({...input,shape:{...input.shape,run_class:'live-test'}}),{code:'NOT_APPROVED'});
  const stopped=buildStage2Result({...input,shape:{...input.shape,projection:{stop:'TOKEN_LIKE',hitClass:'BEARER',jsonPathOrLineNo:1}}});
  assert.equal(stopped.status,'STOPPED');
  assert.equal(stopped.projection.shape,undefined);
  const version=buildStage2Result({...input,operation:'c-v',done:{exit:1},raw:'must not be projected'});
  assert.equal(version.raw,undefined);
  assert.equal(version.exitCode,1);
  assert.equal(version.status,'NOT_RUN');
});

test('stage2 inventory comparison refuses missing observations and reports drift or unowned survivors without killing', () => {
  const snapshot = { status: 'OK', files: { image: { sha256: 'A'.repeat(64) }, install: [], profiles: [] },
    resolution: { path: 'C:\\fixture\\cli.exe' }, paths: [],
    system: { users: [], groups: [], sandboxMembers: [], firewall: [] }, processes: { Status: 'OK', Processes: [] } };
  const scope = { startedFiletime: '100', endedFiletime: '200', sandboxSids: ['S-1-5-21-1003'], installFolder: 'C:\\fixture' };
  assert.equal(compareInventoryObservations(snapshot, structuredClone(snapshot), scope).result, 'PASS');
  for (const field of ['files', 'resolution', 'paths', 'system', 'processes']) {
    const missing = structuredClone(snapshot); delete missing[field];
    assert.equal(compareInventoryObservations(snapshot, missing, scope).result, 'NOT_RUN');
  }
  const drift = structuredClone(snapshot); drift.paths.push({ sddl: 'changed' });
  assert.equal(compareInventoryObservations(snapshot, drift, scope).result, 'FAIL');
  const survivor = structuredClone(snapshot);
  survivor.processes.Processes.push({ Pid: 123, ParentPid:122, CreatedFiletime: '150', ParentCreatedFiletime:'140',
    OwnerSid: 'S-1-5-21-1003', Image: 'C:\\elsewhere\\child.exe', ImageSha256:'B'.repeat(64), Error: null });
  assert.equal(compareInventoryObservations(snapshot, survivor, scope).result, 'FAIL');
  assert.equal(compareInventoryObservations(survivor, snapshot, scope).reason, 'sandbox users busy');
  const ownerSurvivor=structuredClone(survivor);
  Object.assign(ownerSurvivor.processes.Processes[0],{OwnerSid:'S-1-5-21-2000',Image:'C:\\fixture\\private-process.exe'});
  const ownerResult=compareInventoryObservations(snapshot,ownerSurvivor,scope);
  assert.equal(ownerResult.result,'FAIL');
  assert.equal(ownerResult.survivors[0].image,undefined);
  assert.equal(ownerResult.survivors[0].imageSha256,'B'.repeat(64));
  for(const field of ['ParentPid','ParentCreatedFiletime','ImageSha256','OwnerSid']){
    const invalid=structuredClone(survivor);invalid.processes.Processes[0][field]=null;
    assert.equal(compareInventoryObservations(snapshot,invalid,scope).result,'NOT_RUN',field);
  }
  survivor.processes.Processes[0].Error = 'ACCESS_DENIED';
  assert.equal(compareInventoryObservations(snapshot, survivor, scope).result, 'NOT_RUN');
});

test('stage2 protected inventory entry refuses disposable controls before reading approval or resolving a tool', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dye-inventory-entry-'));
  const path = join(directory, 'approval.json');
  writeFileSync(path, 'not-json: must never be read');
  await assert.rejects(Promise.resolve().then(() => liveProbeCommand(['inventory', '--spec', path])),
    /Protected inventory control path required|Live mode rejects test flags/);
  assert.equal(readFileSync(path, 'utf8'), 'not-json: must never be read');
  assert.throws(() => liveProbeCommand(['run', '--spec', path]), /requires later approval/);
});

test('stage2 inventory approval binds all nine reviewed commands and refuses probe authority', () => {
  for (const [id, template] of Object.entries(INVENTORY_TEMPLATES)) {
    const binding = { templateId: id, runId: 'dye-live-11111111-1111-1111-1111-111111111111',
      runClass: 'live-real', bundleHash: 'A'.repeat(64), providerContactAllowed: false,
      tools: { [template.role]: { path: 'C:\\fixture\\tool.exe', sha256: 'B'.repeat(64) } } };
    const approval = { kind: 'S2-C', mode: 'live-nonmodel', runClass: binding.runClass,
      bundleHash: binding.bundleHash, inventoryRegistryHash, runId: binding.runId,
      templateIds: [id], providerContactAllowed: false, tools: structuredClone(binding.tools),
      environments: { [template.role]: template.env } };
    const bound = bindInventoryApproval(approval, binding);
    assert.deepEqual(bound.argv, template.argv);
    assert.deepEqual(bound.environment, template.env);
    assert.equal(bound.timeoutMs, 60000);
    assert.equal(bound.outputRoute, id.endsWith('-a') ? 'memory-shape' : 'file');
    for (const mutation of [
      { kind: 'S2-F' }, { runClass: 'live-test' }, { bundleHash: 'C'.repeat(64) },
      { inventoryRegistryHash: 'C'.repeat(64) }, { runId: 'different' },
      { templateIds: ['B1'] }, { templateIds: [id, id] }, { providerContactAllowed: true },
      { environments: {} }, { tools: {} }
    ]) assert.throws(() => bindInventoryApproval({ ...approval, ...mutation }, binding), { code: 'NOT_APPROVED' });
    assert.throws(() => bindInventoryApproval(approval, { ...binding, templateId: 'B1' }), { code: 'NOT_APPROVED' });
  }
});
test('stage2 live dispatch never calls fake handlers or spawnAllowed (module spies)', {skip:process.platform!=='win32'}, () => {
  const root=mkdtempSync(join(tmpdir(),'dye-dispatch-spies-'));
  const script=join(root,'spies.mjs');
  const url=path=>pathToFileURL(resolve('scripts/collab-supervisor',path)).href;
  writeFileSync(script,`
import assert from 'node:assert/strict';
import {mock} from 'node:test';
const policy=await import(${JSON.stringify(url('lib/policy.js'))});
const fake=await import(${JSON.stringify(url('lib/fake-runtime.js'))});
const calls={fakeCommand:0,executeFakeSession:0,spawnAllowed:0};
const stop=name=>()=>{calls[name]++;throw new Error('Unexpected fake route: '+name);};
mock.module(${JSON.stringify(url('lib/policy.js'))},{namedExports:{...policy,spawnAllowed:stop('spawnAllowed')}});
mock.module(${JSON.stringify(url('lib/fake-runtime.js'))},{namedExports:{...fake,fakeCommand:stop('fakeCommand'),executeFakeSession:stop('executeFakeSession')}});
const {main}=await import(${JSON.stringify(url('supervisor.js'))});
process.env.DYE_SUPERVISOR_TEST='1';
assert.throws(()=>main(['platform-probes','live','inventory','--spec',${JSON.stringify(join(root,'absent.json'))}]),{code:'NOT_PLATFORM_ACCEPTED'});
const prior=process.argv;
process.argv=[process.execPath,${JSON.stringify(resolve('scripts/collab-supervisor/coordinator.js'))},'--sealed-live-probe',${JSON.stringify(join(root,'absent.json'))},'A'.repeat(64)];
await import(${JSON.stringify(url('coordinator.js'))}+'?dispatch-live');
assert.equal(process.exitCode,99);process.exitCode=0;
delete process.env.DYE_SUPERVISOR_TEST;
process.argv[2]='--sealed-probe';
await import(${JSON.stringify(url('coordinator.js'))}+'?dispatch-synthetic');
assert.equal(process.exitCode,99);process.exitCode=0;process.argv=prior;
assert.deepEqual(calls,{fakeCommand:0,executeFakeSession:0,spawnAllowed:0});
mock.restoreAll();process.stdout.write('PASS dispatch spies');
`);
  const result=execFileSync(process.execPath,['--experimental-test-module-mocks',script],
    {encoding:'utf8',windowsHide:true,timeout:10000,stdio:['ignore','pipe','pipe']});
  assert.match(result,/PASS dispatch spies/);
});
import { Buffer } from 'node:buffer';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, linkSync, symlinkSync, copyFileSync, lstatSync, readdirSync } from 'node:fs';
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

test('stage2 source boundaries preserve frozen file drain and keep capture and redaction path-free', () => {
  const path = 'scripts/collab-supervisor/lib/windows-job.ps1';
  const current = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
  const frozen = execFileSync('git', ['--no-optional-locks', 'cat-file', 'blob', '7f8c4b9:' + path], {encoding:'utf8'});
  const drain = text => text.match(/  static Task Drain\(IntPtr h,string file\) \{\n[^\n]+\n  \}/)?.[0];
  assert.ok(drain(frozen), 'Frozen file-route drain must be identifiable');
  assert.equal(drain(current), drain(frozen), 'File-route drain remains byte-identical in Git representation');
  const capture = current.slice(current.indexOf(' public sealed class Capture {'), current.indexOf(' public class Inspection'));
  assert.ok(capture.includes('public void Drain(Stream stream)'));
  assert.doesNotMatch(capture, /FileStream|\bFile\.|StreamWriter|ReadAllText|GetString/);
  const auth = readFileSync('scripts/collab-supervisor/lib/auth-shape.ps1','utf8');
  assert.doesNotMatch(auth, /FileStream|\bFile\.|StreamWriter|ReadAllText/);
  const wrapper = readFileSync('scripts/collab-supervisor/run-step.ps1','utf8');
  assert.doesNotMatch(wrapper, /ReadToEnd|ReadAllText|\.Consume\(/);
  assert.match(wrapper, /\[DyeStage2\.AuthShape\]::Project/);
  const broker=readFileSync('scripts/collab-supervisor/lib/broker.ps1','utf8');
  const probeBranch=broker.slice(broker.indexOf('if($null -ne $ProbeRoot){'),broker.indexOf('}else{$step = Read-FakeSpec'));
  assert.ok(probeBranch.length>0);
  assert.doesNotMatch(probeBranch, /'fake'/);
  assert.ok(probeBranch.includes("'-ProbeMode',$ProbeRoot['mode']"));
  assert.ok(probeBranch.includes("if($ProbeRoot['mode'] -ceq 'live-nonmodel'){$harness=@()}"));
  // John's A12 exception permits the API only in the disposable test helper.
  // Scan every production file; acceptance/ contains the generated helper text.
  const production=resolve('scripts/collab-supervisor');
  function scan(directory) {
    for(const entry of readdirSync(directory,{withFileTypes:true})) {
      if(entry.name==='acceptance')continue;
      const path=join(directory,entry.name);
      if(entry.isDirectory())scan(path);
      else if(/\.(?:js|mjs|ps1)$/.test(entry.name))assert.doesNotMatch(readFileSync(path,'utf8'),/DuplicateHandle/,path);
    }
  }
  scan(production);
  for(const path of ['scripts/collab-supervisor/lib/setup-acl.ps1',
    'scripts/collab-supervisor/acceptance/platform-setup.ps1',
    'scripts/collab-supervisor/acceptance/platform-setup.test.js']) {
    // Compare actual checkout bytes, including this repository's CRLF filter.
    const accepted=execFileSync('git',['cat-file','--filters','7f8c4b9:'+path]);
    assert.deepEqual(readFileSync(path),accepted,'Frozen Stage 1b checkout bytes: '+path);
  }
});
const temp=()=>mkdtempSync(join(tmpdir(),'dye-probe-contract-'));
const psQuote=value=>"'"+value.replaceAll("'","''")+"'";
const wire={mode:'fake',schema:1,type:'vector'};

test('probe.live_gate: forged all-PASS eligibility cannot dispatch run, resume or probes',async()=>{
  const forged={phase:'B',bundle:'forged',versions:{v:'1'},approval:{phase:'B',bundle:'forged'},platform:{bundle:'forged',versions:{v:'1'},reviewed:true,required:[{result:'PASS'}]}};
  assert.equal(realEligibility(forged),true); // Legacy pure predicate only; no execution authority.
  for(const command of ['approve','run','resume','recover'])assert.throws(()=>main([command,JSON.stringify(forged)]),{code:'NOT_PLATFORM_ACCEPTED'});
  for(const mode of ['live','real','B',undefined])await assert.rejects(async()=>main(['platform-probes',mode,'run','--spec','C:\\DO-NOT-READ']),{code:'NOT_PLATFORM_ACCEPTED'});
  assert.throws(()=>probeMode('live'),{code:'NOT_PLATFORM_ACCEPTED'});
});
test('probe.strict_tokens: duplicates, ambiguous names, malformed types and framing refuse',()=>{
  for(const text of ['{"mode":"fake","mode":"fake"}\n','{"Argv":"x"}\n','{"\\u006dode":"fake"}\n','{"unknown":"x"}\n','{"schema":true}\n','{"schema":null}\n','{"schema":[]}\n','{"schema":{}}\n','{"schema":1.0}\n','{"schema":1e0}\n','{"schema":01}\n','{"schema":-0}\n','{"schema":9007199254740992}\n','{"type":"vector","mode":"fake"}\n','{"mode":"Fake"}\n','{"type":"VECTOR"}\n','{"argv_count":1}\n','{"argv_0001":"x","argv_count":1}\n','{"mode":"fa\\nke"}\n','{"mode":"fak\u00e9"}\n','{"schema":1,}\n','{"schema":1}\n\n','\uFEFF{"schema":1}\n','{"schema":1}\r\n']){
    assert.throws(()=>parseWire(Buffer.from(text),{paths:false}),undefined,text);
  }
  assert.throws(()=>parseWire(Buffer.from([0xff,0x0a])));
  assert.deepEqual({...parseWire(canonicalWire(wire),{paths:false})},wire);
});

test('stage2 cross-mode wire records cannot be reused as manifests requests consumption or starts', () => {
  for (const type of ['manifest','request','consumption','started']) {
    const fake = canonicalWire({schema:1,type,mode:'fake'},'fake');
    const live = canonicalWire({schema:1,type,mode:'live-nonmodel'},'live-nonmodel');
    assert.equal(parseWire(fake,{paths:false,mode:'fake'}).mode,'fake');
    assert.equal(parseWire(live,{paths:false,mode:'live-nonmodel'}).mode,'live-nonmodel');
    assert.throws(()=>parseWire(fake,{paths:false,mode:'live-nonmodel'}));
    assert.throws(()=>parseWire(live,{paths:false,mode:'fake'}));
  }
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
test('probe.setup: unapproved entry invocation refuses before setup paths',{skip:process.platform!=='win32'},()=>{
  const script=resolve('scripts/collab-supervisor/acceptance/platform-setup.ps1');
  const root=temp();
  for(const action of ['Plan','Apply','Verify','Restore']){
    assert.throws(()=>execFileSync(psRuntime(),['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-Action',action],{cwd:root,windowsHide:true,stdio:'pipe',env:{...process.env,USERPROFILE:root,TEMP:root,TMP:root}}),error=>{
      assert.match(String(error.stderr),/NOT_APPROVED: captured entry bytes/);return true;
    });
    assert.equal(existsSync(join(root,'_supervisor')),false);
    assert.equal(existsSync(join(root,'wp-auto-02-sentinel.txt')),false);
  }
});
test('probe.setup_bundle: changed entry/library refuse before native loading from another cwd',{skip:process.platform!=='win32'},()=>{
  const root=temp(),entry=resolve('scripts/collab-supervisor/acceptance/platform-setup.ps1');
  const run=parameters=>{
    const driver=join(root,randomUUID()+'.ps1');
    writeFileSync(driver,`$ErrorActionPreference='Stop'\n$b=[IO.File]::ReadAllBytes(${psQuote(entry)})\n& ([ScriptBlock]::Create([Text.UTF8Encoding]::new($false,$true).GetString($b))) -SourcePath ${psQuote(entry)} ${parameters}\n`);
    return ()=>execFileSync(psRuntime(),['-NoProfile','-ExecutionPolicy','Bypass','-File',driver],{cwd:root,windowsHide:true,stdio:'pipe',env:{...process.env,USERPROFILE:root,TEMP:root,TMP:root}});
  };
  assert.throws(run(`-EntryHash '${'0'.repeat(64)}' -BundleHash '${'0'.repeat(64)}'`),e=>{assert.match(String(e.stderr),/SOURCE: changed entry bytes/);return true;});
  assert.throws(run(`-EntryHash '${hash(readFileSync(entry)).toLowerCase()}'`),e=>{assert.match(String(e.stderr),/reviewed setup bundle required for every action/);return true;});
  assert.throws(run(`-EntryHash '${hash(readFileSync(entry)).toLowerCase()}' -BundleHash '${'0'.repeat(64)}'`),e=>{assert.match(String(e.stderr),/NOT_APPROVED: changed setup dependency/);return true;});
  for(const name of ['_supervisor','wp-auto-02-sentinel.txt','.env.wp-auto-sentinel'])assert.equal(existsSync(join(root,name)),false);
});
test('probe.setup_recovery: pure journal classification and runtime guards never invoke native access',{skip:process.platform!=='win32'},()=>{
  const root=temp(),driver=join(root,'pure.ps1'),library=resolve('scripts/collab-supervisor/lib/setup-acl.ps1');
  writeFileSync(driver,`$ErrorActionPreference='Stop'
. ${psQuote(library)}
function Initialize-B0Native {throw 'FORBIDDEN_NATIVE'}
function Assert-B0Path {throw 'FORBIDDEN_FILESYSTEM'}
$d=[ordered]@{Kind='file';Id='one';Owner='owner';Sddl='acl';Hash='hash';Size=52}
$o=[ordered]@{Kind='file';Id='one';Owner='owner';Sddl='acl';Hash='hash';Size=52}
$rows=@((Get-B0Classification $null $null),(Get-B0Classification $null $o),(Get-B0Classification $d $o))
foreach($key in @('Kind','Id','Owner','Sddl','Hash','Size')){$copy=@{};foreach($k in $o.Keys){$copy[$k]=$o[$k]};$copy[$key]='different';$rows+=Get-B0Classification $d $copy}
$rows+=Get-B0Classification $d $null
$directory=[ordered]@{Kind='directory';Id='one';Owner='owner';Sddl='acl'}
$changedDirectory=[ordered]@{Kind='directory';Id='one';Owner='owner';Sddl='changed'}
if((Get-B0Classification $directory $changedDirectory) -ne 'UNCERTAIN'){throw 'protected directory descriptor must remain identity'}
$bundle=Get-B0BundleDigest ('a'*64) ('b'*64)
$m=[ordered]@{schema=1;sentinelBytes=52;paths=@('placeholder')}
$digest=Get-B0ManifestDigest $m;$roundtrip=ConvertFrom-Json (ConvertTo-B0Json $m)
if($digest -cne (Get-B0ManifestDigest $roundtrip)){throw 'manifest bytes not stable'}
if((Get-B0TextBytes ('WP-AUTO-02-SENTINEL-'+('f'*32))).Length -ne 52){throw 'sentinel length'}
$blocked=$false;try{Assert-B0Token 'deny' @('owner','deny')}catch{$blocked=$true};if(!$blocked){throw 'token refusal'}
@{rows=$rows;bundle=$bundle}|ConvertTo-Json -Compress
`);
  const result=JSON.parse(execFileSync(psRuntime(),['-NoProfile','-ExecutionPolicy','Bypass','-File',driver],{encoding:'utf8',windowsHide:true}));
  assert.deepEqual(result.rows,['ABSENT','UNCERTAIN','CERTAIN','UNCERTAIN','UNCERTAIN','UNCERTAIN','CERTAIN','UNCERTAIN','UNCERTAIN','ABSENT']);
  assert.equal(result.bundle,hash(`platform-setup.ps1 ${'a'.repeat(64)}\nlib/setup-acl.ps1 ${'b'.repeat(64)}\n`).toLowerCase());
});
test('probe.setup_preloaded: native type refuses before library or setup-path inspection',{skip:process.platform!=='win32'},()=>{
  const root=temp(),entry=resolve('scripts/collab-supervisor/acceptance/platform-setup.ps1');
  const library=resolve('scripts/collab-supervisor/lib/setup-acl.ps1');
  const entryHash=hash(readFileSync(entry)).toLowerCase(),libraryHash=hash(readFileSync(library)).toLowerCase();
  const bundle=hash(`platform-setup.ps1 ${entryHash}\nlib/setup-acl.ps1 ${libraryHash}\n`).toLowerCase();
  const driver=join(root,'preloaded.ps1');
  writeFileSync(driver,`$ErrorActionPreference='Stop'
Add-Type -TypeDefinition 'namespace DyeB0 { public static class Native { public static int OlderVersion() { return 1; } } }'
$bytes=[IO.File]::ReadAllBytes(${psQuote(entry)})
& ([ScriptBlock]::Create([Text.UTF8Encoding]::new($false,$true).GetString($bytes))) -Action Plan -SourcePath ${psQuote(entry)} -EntryHash '${entryHash}' -BundleHash '${bundle}' -EvidenceRoot ${psQuote(root)}
`);
  assert.throws(()=>execFileSync(psRuntime(),['-NoProfile','-ExecutionPolicy','Bypass','-File',driver],{cwd:root,windowsHide:true,stdio:'pipe',env:{...process.env,USERPROFILE:root,TEMP:root,TMP:root}}),error=>{assert.match(String(error.stderr),/NATIVE_PRELOADED/);return true;});
  for(const name of ['_supervisor','wp-auto-02-sentinel.txt','.env.wp-auto-sentinel'])assert.equal(existsSync(join(root,name)),false);
});
test('probe.setup_journal: torn tails and damaged middle chains preserve earlier evidence',{skip:process.platform!=='win32'},()=>{
  const root=temp(),driver=join(root,'journal.ps1'),library=resolve('scripts/collab-supervisor/lib/setup-acl.ps1');
  writeFileSync(driver,`$ErrorActionPreference='Stop'
. ${psQuote(library)}
function Initialize-B0Native {throw 'FORBIDDEN_NATIVE'}
function Get-B0Snapshot {return @{Kind='file'}}
function Assert-B0Path {param($Path,[switch]$MissingLeaf) if(!$Path.StartsWith(${psQuote(root)})){throw 'OUTSIDE_TEST'}}
$p=${psQuote(join(root,'journal.jsonl'))}
Write-B0Exclusive $p @()
Add-B0Journal $p @{event='start'}
Add-B0Journal $p @{event='intent';path='synthetic';step='one'}
$original=[IO.File]::ReadAllBytes($p)
[IO.File]::AppendAllText($p,'{')
$j=Read-B0Journal $p;if(!$j.torn -or $j.rows.Count -ne 2){throw 'torn tail'}
$refused=$false;try{Add-B0Journal $p @{event='done'}}catch{$refused=$true};if(!$refused){throw 'append to torn journal'}
$broken=[Text.UTF8Encoding]::new($false,$true).GetString($original).Replace('"prev":""','"prev":"bad"')
[IO.File]::WriteAllText($p,$broken,[Text.UTF8Encoding]::new($false))
$refused=$false;try{Read-B0Journal $p}catch{$refused=$_.ToString() -match 'JOURNAL_DAMAGED'};if(!$refused){throw 'damaged middle chain'}
'PASS'
`);
  assert.match(execFileSync(psRuntime(),['-NoProfile','-ExecutionPolicy','Bypass','-File',driver],{encoding:'utf8',windowsHide:true}),/PASS/);
});
test('probe.setup_source_boundary: library loading defines functions only',{skip:process.platform!=='win32'},()=>{
  const root=temp(),driver=join(root,'ast.ps1'),library=resolve('scripts/collab-supervisor/lib/setup-acl.ps1');
  writeFileSync(driver,`$ErrorActionPreference='Stop'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile(${psQuote(library)},[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'library parse failed'}
foreach($statement in $ast.EndBlock.Statements){if($statement -isnot [Management.Automation.Language.FunctionDefinitionAst]){throw 'top-level library execution'}}
'PASS'
`);
  assert.match(execFileSync(psRuntime(),['-NoProfile','-ExecutionPolicy','Bypass','-File',driver],{encoding:'utf8',windowsHide:true}),/PASS/);
  const entry=readFileSync(resolve('scripts/collab-supervisor/acceptance/platform-setup.ps1'),'utf8');
  assert.doesNotMatch(entry,/\bSet-Acl\b|\.SetAccessControl\(/);
  // This scan supplements the actual refusal and pure-function runtime guards.
});
test('probe.cross_language: identical adversarial bytes and typed tuples in Windows PowerShell 5.1',{skip:process.platform!=='win32'},()=>{
  const root=temp(),valid=join(root,'regular.json');writeFileSync(valid,'own test data');
  const corpus=[canonicalWire(wire),canonicalWire({...wire,cwd:root,fixture:valid,parent_created:'134000000000000000',...indexed('argv',['x','\\"'])}),
    ...['{"schema":1,"schema":2}\n','{"schema":true}\n','{"schema":9007199254740992}\n','{"schema":-0}\n','{"schema":1e1}\n','{"mode":"Fake"}\n','{"Argv":"x"}\n','{"\\u006dode":"fake"}\n','{"env_count":1}\n','{"schema":1,}\n','\uFEFF{"schema":1}\n','{"schema":1}\r\n','{"unknown":"x"}\n','{"mode":[]}\n','{"mode":null}\n','{"mode":{}}\n','{"mode":"fak\u00e9"}\n','{"type":"vector","schema":1}\n','{"schema":1}\nextra'].map(s=>Buffer.from(s)),
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
$consumedBytes=[IO.File]::ReadAllBytes($second+'.consumed.json')
$foreignMode=[Text.Encoding]::UTF8.GetString($consumedBytes).Replace('"mode":"fake"','"mode":"live-nonmodel"')
[IO.File]::WriteAllText($second+'.consumed.json',$foreignMode,[Text.UTF8Encoding]::new($false))
Expect-Refusal 'foreign_consumption_mode' {Confirm-DyeProbeStart $second ${psQuote(manifest)} '${manifestHash}' ($second+'.consumed.json')} 'mode|contract'
[IO.File]::WriteAllBytes($second+'.consumed.json',$consumedBytes)
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
  assert.equal(rows.length,14);assert.ok(rows.every(row=>row.result==='PASS'));
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
import { assessProbeAttribution, probeJobMembership } from '../scripts/collab-supervisor/lib/processes.js';

test('stage2 membership requires matching creation time, complete bounded samples and final emptiness', () => {
  const process = { pid: 23, createdAt: '116444736010000000', observedAliveAt: '1970-01-01T00:00:03.000Z' };
  const sample = { startUtc: '1970-01-01T00:00:02.000Z', endUtc: '1970-01-01T00:00:02.010Z',
    activeProcesses: 1, members: [{ pid: process.pid, createdFiletime: process.createdAt }] };
  const initial = { job: 'J0', seq: 0, phase: 'initial', status: 'OK', sample };
  const final = { job: 'J0', seq: 1, phase: 'final', status: 'OK',
    sample: { ...sample, activeProcesses: 0, members: [] } };
  assert.deepEqual(probeJobMembership(process, [initial, final]), { membership: 'J0', job: 'J0', seq: 0 });
  assert.deepEqual(probeJobMembership(process, [final]), { membership: 'neither', job: 'J0', seq: 1 });
  assert.equal(probeJobMembership(process, [initial]), null);
  for (const mutation of [
    { status: 'INCOMPLETE' }, { sample: { ...sample, activeProcesses: 2 } },
    { sample: { ...sample, endUtc: '1970-01-01T00:00:02.200Z' } },
    { sample: { ...sample, members: [{ pid: 23, createdFiletime: '116444736020000000' }] } }
  ]) {
    assert.equal(probeJobMembership({ ...process, observedAliveAt: undefined }, [{ ...initial, ...mutation }, final]), null);
  }
});

test('stage2 attribution refuses incomplete observations and reports survivors without terminating them', () => {
  const sample = { pid: 10, parentPid: 9, createdAt: '200', parentCreatedAt: '100',
    image: 'C:\\fixture\\node.exe', imageSha256: 'A'.repeat(64), ownerSid: 'S-1-5-21-1003',
    membership: 'J1', alive: false };
  const assess = processes => assessProbeAttribution({ baseline: [], enumerationComplete: true, processes });
  assert.equal(assess([sample]).result, 'PASS');
  for (const key of Object.keys(sample)) {
    assert.equal(assess([{ ...sample, [key]: null }]).result, 'NOT_RUN', key);
  }
  assert.equal(assess([{ ...sample, alive: true }]).result, 'FAIL');
  assert.equal(assess([{ ...sample, alive: true, membership: 'neither' }]).reason, 'UNATTRIBUTED');
  assert.equal(assess([{ ...sample, parentCreatedAt: '201' }]).result, 'NOT_RUN');
  assert.equal(assess([{ ...sample, error: 'PID_RACE' }]).result, 'NOT_RUN');
  assert.equal(assess([{ ...sample, nonceVerified:true }]).result,'NOT_RUN');
  const nonce='a'.repeat(32);
  const bound={...sample,membership:'neither',nonce,nonceVerified:true,chainVerified:true,alive:true};
  const boundAssessment=row=>assessProbeAttribution({baseline:[],enumerationComplete:true,processes:[row],expectedNonce:nonce});
  assert.equal(boundAssessment(bound).reason,'surviving process');
  assert.equal(boundAssessment({...bound,nonce:'b'.repeat(32),alive:false}).result,'NOT_RUN');
  assert.equal(boundAssessment({...bound,chainVerified:false}).reason,'UNATTRIBUTED');

  assert.equal(assessProbeAttribution({ baseline: [sample], enumerationComplete: true, processes: [] }).reason, 'sandbox users busy');
  assert.equal(assessProbeAttribution({ baseline: [], enumerationComplete: false, processes: [] }).result, 'NOT_RUN');
});

// Synthetic records exercise publication policy only; they are not observations
// from installed tools and cannot satisfy a platform acceptance gate.
test('stage2 inventory quarantine rejects either stream before preparing ordinary artifacts', () => {
  const record={mode:'live-nonmodel',run_class:'live-real',operation:'c-h1',inventoryRegistryHash,done:{exit:0}};
  const safe=Buffer.from('Usage: codex --help\n');
  const secrets=['WP-AUTO-02-SENTINEL-'+ 'a'.repeat(32),'eyJabcdefghijk.','sk-secret',
    'Bearer secret','-----BEGIN PRIVATE KEY-----','a'.repeat(32)];
  for(const secret of secrets)for(const stream of ['stdout','stderr']) {
    const bytes=Buffer.from(secret);
    const publication=inventoryPublication(record,{stdout:safe,stderr:Buffer.alloc(0),[stream]:bytes});
    assert.equal(publication.status,'QUARANTINED');assert.equal(publication.artifacts,undefined);
    assert.ok(!JSON.stringify(publication).includes(secret));
    assert.ok(!JSON.stringify(publication).includes(hash(bytes)));
  }
  assert.deepEqual(scanInventoryOutput(Buffer.from([0xff])),{status:'QUARANTINED',reason:'NON_UTF8'});
  const approved=inventoryPublication(record,{stdout:safe,stderr:Buffer.alloc(0)});
  assert.equal(approved.status,'READY');assert.equal(approved.artifacts.length,2);
  assert.equal(approved.artifacts[1].value.toString(),safe.toString());
  assert.equal(approved.artifacts[0].value.platformAcceptance,'UNVERIFIED');
  const version=inventoryPublication({...record,operation:'c-v'},{stdout:safe,stderr:Buffer.alloc(0)});
  assert.equal(version.artifacts.length,1);
  for(const failed of [
    inventoryPublication({...record,done:{exit:2}},{stdout:safe,stderr:Buffer.alloc(0)}),
    inventoryPublication(record,{stdout:safe,stderr:Buffer.from('error: unknown command')})
  ]) {
    assert.equal(failed.artifacts.length,1);
    assert.equal(failed.artifacts[0].value.status,'NOT_RUN');
  }
  assert.throws(()=>inventoryPublication({...record,run_class:'live-test'},{stdout:safe,stderr:safe}));
});

test('stage2 ordinary publication writes scanned evidence exclusively and quarantines without touching the destination', () => {
  const root=temp(),ordinary=join(root,'ordinary'),id='dye-live-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const record={mode:'live-nonmodel',run_class:'live-real',operation:'l-h1',inventoryRegistryHash,done:{exit:0}};
  const secret='WP-AUTO-02-SENTINEL-'+ 'a'.repeat(32);
  const blocked=publishInventoryArtifacts(record,{stdout:Buffer.from(secret),stderr:Buffer.alloc(0)},ordinary,id);
  assert.equal(blocked.status,'QUARANTINED');assert.equal(existsSync(ordinary),false);
  assert.throws(()=>publishInventoryArtifacts({...record,run_class:'live-test'},undefined,ordinary,id));
  assert.equal(existsSync(ordinary),false);
  const streams={stdout:Buffer.from('Usage: claude --help\n'),stderr:Buffer.alloc(0)};
  const result=publishInventoryArtifacts(record,streams,ordinary,id);
  assert.equal(result.status,'PUBLISHED');
  assert.equal(readFileSync(join(ordinary,'stage2-'+id+'-help-l-h1.txt'),'utf8'),streams.stdout.toString());
  const evidence=new Evidence(ordinary);assert.deepEqual(evidence.verify(),[]);
  assert.equal(evidence.entries().length,2);
  for(const row of evidence.entries()) {
    const bytes=readFileSync(evidence.path(row.artifact));
    assert.ok(!bytes.includes(Buffer.from(secret)));
    assert.ok(!bytes.includes(Buffer.from(hash(Buffer.from(secret)))));
  }
  assert.throws(()=>publishInventoryArtifacts(record,streams,ordinary,id),{code:'EVIDENCE_WRITE'});
  assert.deepEqual(evidence.verify(),[]);
});

test('stage2 network operation uses closed targets and does not follow redirects or read bodies (synthetic modules)', async () => {
  let calls=0,destroyed=0;
  const load=async name=>{
    calls++;
    if(name==='node:dns/promises')return {Resolver:class {resolve4(name){assert.equal(name,'github.com');return Promise.resolve(['synthetic']);}cancel(){}}};
    if(name==='node:net')return {createConnection(options){
      assert.deepEqual(options,{host:'127.0.0.1',port:5087});
      const socket={once(event,callback){if(event==='connect')Promise.resolve().then(callback);return socket;},destroy(){destroyed++;}};
      return socket;
    }};
    if(name==='node:https')return {request(url,options,callback){
      assert.equal(url,'https://github.com/');assert.deepEqual(options,{method:'HEAD'});
      return {once(){},end(){callback({statusCode:200,destroy(){destroyed++;}});},destroy(){destroyed++;}};
    }};
    throw new Error('Unexpected module');
  };
  for(const [kind,target] of [['dns','github.com'],['tcp','127.0.0.1:5087'],['https-head','https://github.com/']]){
    const result=await runNetworkProbe(kind,target,load);assert.equal(result.ok,true);assert.ok(result.elapsed>=0);
  }
  assert.equal(calls,3);assert.equal(destroyed,2);
  await assert.rejects(()=>runNetworkProbe('dns','example.com',load),{code:'PAYLOAD_REFUSED'});
  assert.equal(calls,3);
  let requests=0;
  const redirect=await runNetworkProbe('https-head','https://github.com/',async()=>({request(url,options,callback){
    requests++;return {once(){},end(){callback({statusCode:302,destroy(){}});},destroy(){}};
  }}));
  assert.equal(redirect.ok,false);assert.equal(redirect.error,'REDIRECT_REFUSED');assert.equal(requests,1);
  const denied=await runNetworkProbe('dns','github.com',async()=>({Resolver:class {
    resolve4(){return Promise.reject(Object.assign(new Error('private transport detail'),{code:'ENOTFOUND'}));}cancel(){}
  }}));
  assert.equal(denied.error,'ENOTFOUND');assert.ok(!JSON.stringify(denied).includes('private'));
});

test('stage2 failure evidence preserves uncertain objects and excludes raw error details', () => {
  const root=temp(),run=join(root,'run'),ordinary=join(root,'ordinary');
  const evidence=new Evidence(run);
  evidence.write('manifest.json',{fixture:true});
  const context={run,ordinaryRoot:ordinary,runId:'dye-live-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',operation:'c-a',executionClass:'live-test'};
  const secret='private@example.invalid';
  const record=recordStage2Failure(context,new Error('AREA_PERMISSIONS '+secret));
  assert.equal(record.status,'NOT_RUN');assert.equal(record.reason,'AREA_PERMISSIONS');
  assert.equal(record.objects.find(row=>row.name==='manifest.json').state,'UNCERTAIN');
  assert.equal(record.objects.find(row=>row.name==='raw/c-a.out').state,'ABSENT');
  assert.equal(record.preserved,true);assert.equal(existsSync(ordinary),false);
  assert.ok(!JSON.stringify(record).includes(secret));
  assert.ok(existsSync(join(run,'manifest.json')));assert.deepEqual(evidence.verify(),[]);
  evidence.write('launch-ready.json',{fixture:true});
  const later=recordStage2Failure(context,new Error('unrecognized '+secret));
  assert.equal(later.status,'INVALID');assert.equal(later.reason,'RUN_FAILED');
  for(const row of evidence.entries())assert.ok(!readFileSync(evidence.path(row.artifact),'utf8').includes(secret));
  assert.throws(()=>recordStage2Failure({...context,runId:'../../escape'},new Error(secret)),{code:'EVIDENCE_WRITE'});
});

test('stage2 journal retains linked transitions and refuses torn evidence without repair', () => {
  const root=temp(),evidence=new Evidence(root);
  const context={runId:'dye-live-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',operation:'c-a',executionClass:'live-test'};
  const first=appendStage2Journal(evidence,context,'reserved');
  const next=appendStage2Journal(evidence,context,'launch-intent');
  assert.equal(first.seq,0);assert.equal(next.seq,1);assert.equal(next.previous,hash(JSON.stringify(first)));
  appendStage2Journal(evidence,context,'failed');assert.deepEqual(evidence.verify(),[]);
  const path=join(root,'journal.jsonl'),before=readFileSync(path);
  assert.throws(()=>appendStage2Journal(evidence,{...context,operation:'c-v'},'complete'),{code:'INTEGRITY'});
  assert.deepEqual(readFileSync(path),before);
  const torn=Buffer.concat([before,Buffer.from('{')]);writeFileSync(path,torn);
  assert.throws(()=>appendStage2Journal(evidence,context,'complete'),{code:'INTEGRITY'});
  assert.deepEqual(readFileSync(path),torn);
});
