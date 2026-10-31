import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,existsSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { cliRepository,invokeCli,fixture } from '../../../tests/fixtures/collab-supervisor/cli-repository.js';
import { Evidence } from '../lib/evidence.js';
import { realSweep,processProbe } from '../lib/processes.js';
const source=fileURLToPath(new URL('../../../',import.meta.url));
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceGit=args=>execFileSync('git',['--no-optional-locks','-c','core.fsmonitor=false',...args],{cwd:source,encoding:'utf8'});
const status=()=>JSON.stringify({head:sourceGit(['rev-parse','HEAD']),refs:sourceGit(['for-each-ref','--format=%(refname) %(objectname)']),status:sourceGit(['status','--porcelain=v1','--untracked-files=all']),
  diff:digest(sourceGit(['diff','--binary','--no-ext-diff','--no-textconv','HEAD'])),untracked:sourceGit(['ls-files','--others','--exclude-standard','-z']).split('\0').filter(Boolean).sort().map(path=>[path,digest(readFileSync(join(source,path)))])});
const cases=[
  ['ready',{},'READY'],
  ['corrected',{scenarios:{implement:['implemented'],review:['findings','ready']}},'READY'],
  ['escalated',{scenarios:{implement:['implemented'],review:['findings']}},'ROUNDS_EXHAUSTED'],
  ['timeout',{scenarios:{implement:['hang'],review:['ready']},stepMs:1500},'TIMEOUT'],
  ['auth-stop',{authFixture:{versions:{codex:'fixture-v1',claude:'fixture-v1'},exit:1}},'AUTH_OR_USAGE'],
  ['usage-stop',{scenarios:{implement:['usage'],review:['ready']}},'AUTH_OR_USAGE']
];
for(const [name,config,expected] of cases)test(`CLI ${name}: real components and no marked survivors`,{skip:process.platform!=='win32'},async()=>{
  const before=status(),r=cliRepository(config);
  assert.equal((await invokeCli('approve',r,['--fixture-consent'])).exit,0);
  const result=await invokeCli('run',r);assert.ok(result.stdout,result.stderr);
  const outcome=JSON.parse(result.stdout);assert.equal(outcome.stop,expected,result.stderr);
  const saved=JSON.parse(readFileSync(join(outcome.run,'state.json'),'utf8'));
  assert.equal(saved.stop,expected);assert.ok(existsSync(join(outcome.run,'report.md')));assert.deepEqual(new Evidence(outcome.run).verify(),[]);
  assert.equal(result.exit===0,expected==='READY');
  const shown=await invokeCli('status',r);assert.equal(shown.exit,0,shown.stderr);assert.match(shown.stdout,new RegExp(`Stop: ${expected}`));
  const active=JSON.parse(readFileSync(join(r.config.evidenceRoot,'active-run.json'),'utf8'));
  const sweep=realSweep(active,join(r.root,'after-run-probes'));assert.equal(sweep.result,'PASS');assert.equal(sweep.escapes.length,0);assert.equal(sweep.survivors.length,0);
  assert.equal(status(),before);console.log(JSON.stringify({case:name,result:'PASS',root:r.root,run:outcome.run,worktreeRemoved:!existsSync(outcome.worktree),survivors:0}));
});
test('CLI crash then interactive fixture recover/resume preserves budget and tree',{skip:process.platform!=='win32'},async()=>{
  const before=status(),r=cliRepository({scenarios:{implement:['crash-once'],review:['ready']}});
  assert.equal((await invokeCli('approve',r,['--fixture-consent'])).exit,0);
  const crash=await invokeCli('run',r),first=JSON.parse(crash.stdout);assert.equal(first.stop,'AGENT_ERROR',crash.stderr);
  const checkpoint=JSON.parse(readFileSync(join(first.run,'state.json'),'utf8'));
  assert.ok(existsSync(join(first.run,'evidence-index.jsonl')));assert.equal(checkpoint.stop,'AGENT_ERROR');
  assert.ok(existsSync(join(first.run,'crash-recovery.json')));assert.ok(existsSync(join(r.config.evidenceRoot,'global.lock')));
  assert.equal((await invokeCli('recover',r,['--fixture-consent'])).exit,0);
  const resumed=await invokeCli('resume',r,['--fixture-consent','--retry-agent']);assert.equal(resumed.exit,0,resumed.stderr+resumed.stdout+' root='+r.root);
  const final=JSON.parse(readFileSync(join(first.run,'state.json'),'utf8'));assert.equal(final.stop,'READY');assert.equal(final.budget.originalDeadlineUtc,checkpoint.budget.originalDeadlineUtc);
  const active=JSON.parse(readFileSync(join(r.config.evidenceRoot,'active-run.json'),'utf8'));
  const clean=realSweep(active,join(r.root,'after-resume-probes'));assert.equal(clean.result,'PASS');assert.equal(clean.escapes.length,0);
  assert.deepEqual(new Evidence(first.run).verify(),[]);assert.equal(status(),before);console.log(JSON.stringify({case:'crash-recover-resume',result:'PASS',root:r.root}));
});
test('CLI stale lock and damaged lock are explicit, no automatic stealing',{skip:process.platform!=='win32'},async()=>{
  const before=status(),r=cliRepository();assert.equal((await invokeCli('approve',r,['--fixture-consent'])).exit,0);
  const lock=join(r.config.evidenceRoot,'global.lock');writeFileSync(lock,JSON.stringify({node:{pid:2147483600,createdAt:'1'},launcher:{pid:2147483601,createdAt:'1'}}));
  const stale=await invokeCli('run',r);assert.equal(JSON.parse(stale.stdout).stop,'LOCK_STALE',stale.stderr);assert.ok(existsSync(lock));
  writeFileSync(lock,'');const damaged=await invokeCli('run',r);assert.equal(JSON.parse(damaged.stdout).stop,'LOCK_DAMAGED',damaged.stderr);
  for(const [result,expected] of [[stale,'LOCK_STALE'],[damaged,'LOCK_DAMAGED']]){
    const out=JSON.parse(result.stdout);assert.equal(JSON.parse(readFileSync(join(out.run,'state.json'),'utf8')).stop,expected);assert.ok(existsSync(join(out.run,'report.md')));assert.deepEqual(new Evidence(out.run).verify(),[]);assert.notEqual(result.exit,0);
    assert.equal(out.launcher.empty,true);assert.equal(out.launcher.sweep.result,'PASS');assert.equal(out.launcher.sweep.escapes.length,0);assert.equal(out.launcher.sweep.survivors.length,0);
  }
  assert.equal(status(),before);console.log(JSON.stringify({case:'stale-damaged-lock',result:'PASS',root:r.root}));
});
test('CLI fake gates reject real mode, projects, remotes, missing markers and bypass flags',{skip:process.platform!=='win32'},async()=>{
  const before=status();
  for(const [name,alter] of [
    ['real-mode',r=>{r.config.mode='real';}],
    ['missing-test-harness',r=>{r.config.testHarness=false;}],
    ['missing-kind',r=>{r.config.kind='other';}],
    ['missing-environment-gate',r=>{r.environment={DYE_SUPERVISOR_TEST:'0'};}],
    ['fixture-hash',r=>{r.config.fixtureHash='BAD';}],
    ['project-repository',r=>{r.config.repository=source;}],
    ['durable-evidence',r=>{r.config.evidenceRoot='C:/Projects/dye-ledger-evidence/WP-AUTO-01';}],
    ['remote',r=>r.git(['remote','add','invalid-fixture-remote','file:///invalid-fixture-target'])],
    ['marker',r=>writeFileSync(join(r.config.repository,'.dye-supervisor-fake.json'),'{}')],
    ['seam-field',r=>{r.config.disableLauncherExitWatch=true;}]
  ]){
    const r=cliRepository();alter(r);writeFileSync(r.path,JSON.stringify(r.config));
    const result=await invokeCli('approve',r,['--fixture-consent'],r.environment||{});assert.notEqual(result.exit,0,name);assert.ok(!existsSync(join(r.config.evidenceRoot,'approvals.jsonl')),name);
    console.log(JSON.stringify({guard:name,result:'PASS',root:r.root}));
  }
  assert.equal(status(),before);
});
test('CLI global mutex refuses a concurrent run and preserves the active epoch',{skip:process.platform!=='win32'},async()=>{
  const before=status(),r=cliRepository({scenarios:{implement:['hang'],review:['ready']},stepMs:10000});
  assert.equal((await invokeCli('approve',r,['--fixture-consent'])).exit,0);
  const first=invokeCli('run',r),activePath=join(r.config.evidenceRoot,'active-run.json'),deadline=Date.now()+15000;
  while(!existsSync(activePath)){assert.ok(Date.now()<deadline);await delay(20);}
  const epoch=JSON.parse(readFileSync(activePath,'utf8'));
  const second=await invokeCli('run',r);assert.equal(JSON.parse(second.stdout).stop,'LOCK_HELD',second.stderr);
  assert.equal(JSON.parse(readFileSync(activePath,'utf8')).runId,epoch.runId);
  const ended=await first;assert.equal(JSON.parse(ended.stdout).stop,'TIMEOUT',ended.stderr);assert.equal(existsSync(join(r.config.evidenceRoot,'global.lock')),false);
  const sweep=realSweep(epoch,join(r.root,'concurrency-probes'));assert.equal(sweep.result,'PASS');assert.equal(sweep.survivors.length,0);assert.equal(sweep.escapes.length,0);
  assert.equal(status(),before);console.log(JSON.stringify({case:'concurrent-mutex',result:'PASS',root:r.root}));
});
test('real enumerator sees and terminates an ordinary test-owned marked process',{skip:process.platform!=='win32'},async()=>{
  const {spawn}=await import('node:child_process');const {randomUUID}=await import('node:crypto');const r=cliRepository(),marker='dye-fake-'+randomUUID(),startedAt=Date.now();
  const child=spawn(process.execPath,[fixture,'hang','--dye-run-marker='+marker],{windowsHide:true,stdio:'ignore'});
  try{
    const current=processProbe({action:'inspect',pids:[child.pid]},join(r.root,'probes')).processes[0];assert.equal(current.alive,true);
    const swept=realSweep({marker,fixture,startedAt},join(r.root,'probes'));assert.equal(swept.result,'PASS');assert.equal(swept.escapes[0].pid,child.pid);assert.equal(swept.survivors.length,0);
    console.log(JSON.stringify({case:'ordinary-spawn-sweep',result:'PASS',root:r.root,pid:child.pid}));
  }finally{child.kill();}
});

test('CLI checkpoint reader beyond retry window stops with EVIDENCE_WRITE and empties J0',{skip:process.platform!=='win32'},async()=>{
  const {spawn}=await import('node:child_process');
  const before=status(),r=cliRepository({scenarios:{implement:['hang'],review:['ready']},stepMs:6000});
  assert.equal((await invokeCli('approve',r,['--fixture-consent'])).exit,0);
  const run=invokeCli('run',r);let reader,readerDone;
  try{
    const activePath=join(r.config.evidenceRoot,'active-run.json'),until=Date.now()+15000;
    while(!existsSync(activePath)){assert.ok(Date.now()<until);await delay(20);}
    const active=JSON.parse(readFileSync(activePath,'utf8')),spool=join(active.paths.run,'spool');
    const {readdirSync}=await import('node:fs');let request;
    while(!request){assert.ok(Date.now()<until);request=readdirSync(spool).find(name=>name.endsWith('.membership.json'));if(!request)await delay(20);}
    const step=JSON.parse(readFileSync(join(spool,request.replace('.membership.json','')),'utf8'));
    const ready=join(r.root,'reader-ready'),readerSpec=join(r.root,'reader.json');
    writeFileSync(readerSpec,JSON.stringify({target:join(active.paths.run,'state.json'),ready,holdMs:2500,startAt:step.deadlineUtc-200}));
    const ps=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
    const helper=fileURLToPath(new URL('../../../tests/fixtures/collab-supervisor/hold-checkpoint.ps1',import.meta.url));
    reader=spawn(ps,['-NoProfile','-ExecutionPolicy','Bypass','-File',helper,'-Request',readerSpec],{windowsHide:true,stdio:['ignore','ignore','pipe']});
    let errors='';reader.stderr.on('data',bytes=>{errors+=bytes;});
    readerDone=new Promise((resolve,reject)=>{reader.on('error',reject);reader.on('close',code=>code===0?resolve():reject(new Error(errors)));});
    const result=await run;await readerDone;assert.ok(existsSync(ready));
    const out=JSON.parse(result.stdout);assert.equal(out.stop,'EVIDENCE_WRITE',result.stderr);
    assert.equal(out.launcher.empty,true);assert.equal(out.launcher.sweep.result,'PASS');
    const state=JSON.parse(readFileSync(join(out.run,'state.json'),'utf8'));
    assert.equal(state.stop,'EVIDENCE_WRITE');assert.equal(state.evidenceIncomplete.length,new Set(state.evidenceIncomplete).size);
    const clean=realSweep(active,join(r.root,'after-reader-probes'));assert.equal(clean.result,'PASS');assert.equal(clean.survivors.length,0);assert.equal(clean.escapes.length,0);
    assert.equal(status(),before);console.log(JSON.stringify({case:'long-checkpoint-reader',result:'PASS',root:r.root,run:out.run,survivors:0}));
  }finally{if(reader?.exitCode===null)reader.kill();await run;await readerDone;}
});

test('CLI recover treats reused identity as dead without terminating its live PID occupant',{skip:process.platform!=='win32'},async()=>{
  const {spawn}=await import('node:child_process');const {randomUUID}=await import('node:crypto');
  const before=status(),r=cliRepository();assert.equal((await invokeCli('approve',r,['--fixture-consent'])).exit,0);
  // Fixed test fixture, deliberately unmarked: it is not an escaped run process.
  const child=spawn(process.execPath,[fixture,'hang'],{windowsHide:true,stdio:'ignore'});
  const exited=new Promise(resolve=>child.on('close',resolve));
  try{
    const identity=processProbe({action:'inspect',pids:[child.pid]},join(r.root,'pid-probes')).processes[0];
    assert.equal(identity.alive,true);assert.equal(identity.unknown,false);
    const previous=(BigInt(identity.createdAt)-1n).toString(),owner={pid:child.pid,createdAt:previous};
    const marker='dye-fake-'+randomUUID();
    writeFileSync(join(r.config.evidenceRoot,'global.lock'),JSON.stringify({node:owner,launcher:owner,marker,fixture,startedAt:Date.now()}));
    const recovered=await invokeCli('recover',r,['--fixture-consent']);assert.equal(recovered.exit,0,recovered.stderr);
    const outcome=JSON.parse(recovered.stdout);assert.equal(outcome.recovered,true);assert.equal(outcome.sweep.result,'PASS');assert.equal(outcome.sweep.escapes.length,0);
    assert.equal(existsSync(join(r.config.evidenceRoot,'global.lock')),false);
    const alive=processProbe({action:'inspect',pids:[child.pid]},join(r.root,'pid-probes')).processes[0];
    assert.equal(alive.alive,true);assert.equal(alive.createdAt,identity.createdAt);
    assert.equal(status(),before);console.log(JSON.stringify({case:'pid-reuse-recovery',result:'PASS',root:r.root,pid:child.pid,liveOccupantPreserved:true}));
  }finally{child.kill();await exited;}
});
