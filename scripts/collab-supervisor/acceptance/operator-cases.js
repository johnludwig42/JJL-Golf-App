import { mkdtempSync,writeFileSync,readFileSync,existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { processProbe,realSweep,readJson } from '../lib/processes.js';
import { hash,fault } from '../lib/policy.js';
import { fakeCommand,collectFakeRun } from '../lib/fake-runtime.js';
import { psRuntime } from '../lib/fake-config.js';
import { cliRepository,fixture,invokeCli } from '../../../tests/fixtures/collab-supervisor/cli-repository.js';
export function operatorSkipReason(){
  if(process.env.DYE_A5_OPERATOR!=='1')return 'NOT_RUN (operator-only; not run by Codex): set DYE_A5_OPERATOR=1 in the owner terminal';
  if(process.platform!=='win32')return 'NOT_RUN (operator-only): Windows required';
  const root=mkdtempSync(join(tmpdir(),'dye-operator-gate-'));
  try{const gate=processProbe({action:'operatorGate'},root);return gate.allowed?false:`NOT_RUN (operator-only): ${gate.reason}`;}
  catch(error){return `NOT_RUN (operator-only): token inspection failed: ${error.code}`;}
}
export async function runOperatorCase(name){
  const refusal=operatorSkipReason();if(refusal)throw fault('NOT_APPROVED',refusal);
  const r=cliRepository({scenarios:{implement:['hang'],review:['ready']},stepMs:60000});
  const helper=fileURLToPath(new URL('./operator-action.ps1',import.meta.url));
  const invoke=data=>{const path=join(r.root,randomUUID()+'.operator.json');writeFileSync(path,JSON.stringify(data));return JSON.parse(execFileSync(psRuntime(),['-NoProfile','-ExecutionPolicy','Bypass','-File',helper,'-Request',path],{env:{...process.env,DYE_SUPERVISOR_TEST:'1'},encoding:'utf8',windowsHide:true,timeout:65000,maxBuffer:1024*1024}));};
  if(name==='detected_wmi_escape'){
    const marker='dye-fake-'+randomUUID(),startedAt=Date.now();
    let made;
    try{
      made=invoke({action:'wmi',marker,fixture,fixtureHash:hash(readFileSync(fixture)),node:process.execPath,cwd:r.root});
      const swept=realSweep({marker,fixture,startedAt},join(r.root,'sweep'));
      assert.equal(swept.result,'PASS');assert.equal(swept.escapes.length,1);assert.equal(swept.escapes[0].pid,made.pid);assert.equal(swept.survivors.length,0);
      const again=realSweep({marker,fixture,startedAt},join(r.root,'verify'));assert.equal(again.escapes.length,0);
      console.log(JSON.stringify({case:name,result:'PASS',root:r.root,sweep:swept}));
    }finally{
      const cleanup=realSweep({marker,fixture,startedAt},join(r.root,'owned-cleanup-sweep'));
      if(made)processProbe({action:'terminate',pid:made.pid,createdAt:made.createdAt},join(r.root,'owned-cleanup'));
      if(cleanup.result!=='PASS')throw fault('ISOLATION',`Operator WMI cleanup unconfirmed; retain ${r.root}`);
    }
    return;
  }
  assert.equal((await invokeCli('approve',r,['--fixture-consent'])).exit,0);
  const prepared=await fakeCommand('run',r.path,{prepareOnly:true});
  const controlled=invoke({action:name,launchSpec:prepared.launchSpec});assert.equal(controlled.empty,true);
  if(name==='console_close'){
    const eventPath=prepared.launchSpec+'.console-event.json';
    assert.ok(existsSync(eventPath),'close not delivered');
    const event=readJson(eventPath);assert.equal(event.kind,2);assert.ok(Date.parse(event.at));
  }
  const ended=readJson(prepared.paths.launchDone);assert.equal(ended.reason,'owner_interrupt');assert.equal(ended.action,'terminate_J0');assert.equal(ended.empty,true);assert.ok(Date.parse(ended.at));
  const collected=collectFakeRun(prepared);
  if(name==='console_close' && ended.sweep?.result==='NOT_RUN'){
    assert.equal(ended.sweep.reason,'console_close_time_limit');assert.equal(ended.consoleClosing,true);
    assert.equal(JSON.parse(collected.output).stop,'ISOLATION');
  }else{
    assert.equal(ended.sweep?.result,'PASS');assert.equal(JSON.parse(collected.output).stop,'OWNER_INTERRUPT');
  }
  assert.ok(existsSync(join(r.config.evidenceRoot,'global.lock')));
  const recovered=await invokeCli('recover',r,['--fixture-consent']);assert.equal(recovered.exit,0,recovered.stderr);
  const clean=realSweep({marker:prepared.marker,fixture,startedAt:prepared.startedAt},join(r.root,'verify'));assert.equal(clean.result,'PASS');assert.equal(clean.escapes.length,0);
  console.log(JSON.stringify({case:name,result:'PASS',root:r.root,controlled,actingLayer:ended}));
}
