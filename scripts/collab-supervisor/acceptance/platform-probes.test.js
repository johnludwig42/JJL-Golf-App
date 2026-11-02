import test from 'node:test';
import assert from 'node:assert/strict';
import { refuseReal } from '../lib/policy.js';
import { cliRepository,cli } from '../../../tests/fixtures/collab-supervisor/cli-repository.js';
import { spawn,execFileSync } from 'node:child_process';
import { readFileSync,writeFileSync,existsSync,linkSync } from 'node:fs';
import { join } from 'node:path';
import { hash } from '../lib/policy.js';
import { realSweep } from '../lib/processes.js';
import { Evidence } from '../lib/evidence.js';

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
