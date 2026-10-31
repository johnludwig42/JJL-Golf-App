import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, fsyncSync, closeSync, renameSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createInterface } from 'node:readline/promises';
import { loadFakeConfig, trustedGit, bundleHash, psRuntime, toolRoot, tempPath } from './fake-config.js';
import { childEnvironment, hash, fault } from './policy.js';
import { Evidence } from './evidence.js';
import { Git, regularTree } from './git.js';
import { fingerprint, treeSignature } from './fingerprint.js';
import { snapshot, verifySnapshot } from './snapshot.js';
import { records, recordApproval, verifyApproval } from './approvals.js';
import { takeLock, recoverLock, readLock, lockState } from './lock.js';
import { inspector, realSweep, readJson } from './processes.js';
import { runSession, resumeState, EXIT } from './state.js';
import { runCheck } from './checks.js';
import { parseAgentOutput } from './agents.js';
import { report } from './report.js';
import { replaceCheckpoint } from './replace.js';

function atomic(path, value) {
  const temporary=path+'.'+randomUUID()+'.tmp'; mkdirSync(dirname(path),{recursive:true});
  const fd=openSync(temporary,'wx');try{writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);}finally{closeSync(fd);}replaceCheckpoint(temporary,path);
}
async function waitFor(path, until) {
  while(!existsSync(path)){if(Date.now()>=until)throw fault('TIMEOUT',`No completion record: ${path}`);await delay(20);}
  return readJson(path);
}
async function consent(config, options, text) {
  if(options.fixtureConsent===true){return 'Synthetic Phase A fixture consent; no owner identity';}
  if(!process.stdin.isTTY || process.env.DYE_SUPERVISOR_CHILD)throw fault('NOT_APPROVED','Interactive owner consent required');
  const input=createInterface({input:process.stdin,output:process.stdout});
  try { if(await input.question(`${text}\nType ${config.packageId} A: `)!==`${config.packageId} A`)throw fault('NOT_APPROVED'); }
  finally{input.close();}
  return 'John (recorded; identity not verified)';
}
function verifyConfig(config) {
  if(hash(readFileSync(config.configPath))!==config.configHash || bundleHash()!==config.bundle)throw fault('NOT_APPROVED','Approved configuration or supervisor bundle changed');
}
export async function fakeCommand(command, configPath, options={}) {
  const config=loadFakeConfig(configPath);
  const approvals=join(config.evidenceRoot,'approvals.jsonl'),approved=join(config.evidenceRoot,'approved-package.md');
  if(command==='approve'){
    const who=await consent(config,options,'Approve this synthetic fake-only test package.');
    if(existsSync(approved))throw fault('NOT_APPROVED','Synthetic approval already exists; use a new evidence root');
    const bytes=readFileSync(config.packageFile);writeFileSync(approved,bytes,{flag:'wx'});
    const row=recordApproval(approvals,{packageId:config.packageId,phase:'A',baseSha:config.baseSha,bundle:config.bundle,packageHash:hash(bytes),configHash:config.configHash,approvedAt:new Date().toISOString(),synthetic:true}, {tty:true,enteredId:config.packageId,enteredPhase:'A'});
    return {exit:0,output:JSON.stringify({approved:true,synthetic:true,consent:who,packageHash:row.packageHash})+'\n'};
  }
  const approval=records(approvals).at(-1);
  verifyConfig(config);verifyApproval(approval,readFileSync(config.packageFile),readFileSync(approved),config);
  if(approval.configHash!==config.configHash)throw fault('NOT_APPROVED');
  const lock=join(config.evidenceRoot,'global.lock'),probes=join(config.evidenceRoot,'process-evidence');
  if(command==='status'){
    const active=readJson(join(config.evidenceRoot,'active-run.json'));
    return{exit:0,output:report(readJson(join(active.paths.run,'state.json')),{reconstructed:true})};
  }
  if(command==='recover'){
    await consent(config,options,'Recover the synthetic lock only after a verified marker sweep.');
    let active;
    try{const owner=readLock(lock);if(lockState(owner,inspector(probes))!=='LOCK_STALE')throw fault('LOCK_HELD');active=owner;}
    catch(error){if(error.code!=='LOCK_DAMAGED'||!options.damagedConfirmed)throw error;active=readJson(join(config.evidenceRoot,'active-run.json'));const ready=readJson(active.paths.launchReady);if(lockState({node:{pid:ready.pid,createdAt:ready.created},launcher:{pid:ready.launcher,createdAt:ready.launcherCreated}},inspector(probes))!=='LOCK_STALE')throw fault('LOCK_HELD');}
    const sweep=realSweep(active,probes);atomic(join(config.evidenceRoot,`recover-sweep-${randomUUID()}.json`),sweep);
    if(sweep.result!=='PASS')throw fault('ISOLATION','Recovery sweep incomplete');
    const restored=recoverLock(lock,join(config.evidenceRoot,`recovered-${randomUUID()}.lock`),{tty:true,inspect:inspector(probes),survivors:()=>sweep.survivors,damagedConfirmed:options.damagedConfirmed===true});
    return {exit:0,output:JSON.stringify({recovered:true,damaged:!!restored.damaged,sweep})+'\n'};
  }
  let resumed=null,paths,marker,startedAt;
  if(command==='resume'){
    await consent(config,options,'Resume the retained synthetic run with its original deadline.');
    if(existsSync(lock))throw fault('LOCK_HELD','Run recover before resume');
    paths=readJson(join(config.evidenceRoot,'active-run.json')).paths;
    const saved=readJson(join(paths.run,'state.json')),crash=readJson(join(paths.run,'crash-recovery.json'));
    if(options.retryAgent!==true)throw fault('OWNER_APPROVAL','Explicit retry-agent choice required; review retained crash diff first');
    const git=new Git({executable:config.gitExecutable,root:paths.worktree,gitDir:crash.gitDir,emptyConfig:config.emptyConfig,emptyHooks:config.emptyHooks,pointer:join(paths.worktree,'.git')});
    resumed=resumeState(saved,{now:Date.now(),source:readFileSync(config.packageFile),approved:readFileSync(approved),record:approval,identity:config,signature:treeSignature(git,config.baseSha),expectedSignature:crash.signature,ownerRetry:true});
    marker=crash.marker;startedAt=crash.startedAt;
    if(existsSync(join(paths.run,'rounds',`r${resumed.round}`)))resumed.round++;
    if(resumed.round>3)throw fault('ROUNDS_EXHAUSTED');
  }else{
    const id=randomUUID();marker='dye-fake-'+id;startedAt=Date.now();
    const run=join(config.evidenceRoot,'runs',id);mkdirSync(run,{recursive:true});
    paths={run,worktree:join(config.repository,'fake-worktrees',id)};
  }
  mkdirSync(join(paths.run,'spool'),{recursive:true});
  const launchId=randomUUID();
  paths={...paths,launchReady:join(paths.run,`${launchId}.launcher-ready.json`),launchDone:join(paths.run,`${launchId}.launcher-done.json`),ownerStop:join(paths.run,`${launchId}.owner-stop`),completion:join(paths.run,`${launchId}.completion.json`)};
  config.approval=approval;config.approvedFile=approved;
  const transport={config,paths,resumed,marker,startedAt};
  const transportFile=join(paths.run,`${launchId}.transport.json`);atomic(transportFile,transport);
  const coordinator=join(toolRoot,'coordinator.js'),launchSpec=join(paths.run,`${launchId}.launch.json`);
  atomic(launchSpec,{kind:'fake',executable:process.execPath,fixture:coordinator,fixtureHash:hash(readFileSync(coordinator)),args:[coordinator,transportFile,'--dye-run-marker='+marker],cwd:paths.run,
    stdout:join(paths.run,`${launchId}.coordinator.stdout`),stderr:join(paths.run,`${launchId}.coordinator.stderr`),ready:paths.launchReady,done:paths.launchDone,
    stepsDir:join(paths.run,'spool'),totalMs:resumed?Math.max(1,resumed.budget.originalDeadlineUtc-Date.now()):config.totalMs,graceMs:1000,marker,agentFixture:config.fixture,startedAt,ownerStop:paths.ownerStop});
  if(options.prepareOnly===true)return{config,paths,launchSpec,launchId,marker,startedAt};
  const env={...childEnvironment(process.env,config.osTemp,marker,[dirname(process.execPath),dirname(config.gitExecutable)]),DYE_SUPERVISOR_TEST:'1',PATHEXT:'.EXE;.COM'};
  const child=spawn(psRuntime(),['-NoProfile','-ExecutionPolicy','Bypass','-File',join(toolRoot,'launch.ps1'),'-SpecPath',launchSpec,'-TestHarness'],{cwd:paths.run,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let errors='';child.stderr.on('data',data=>{errors+=data;});
  const ownerStop=()=>{if(!existsSync(paths.ownerStop))writeFileSync(paths.ownerStop,'owner interrupt',{flag:'wx'});};
  process.on('SIGINT',ownerStop);process.on('SIGTERM',ownerStop);
  try{await new Promise((done,reject)=>{child.on('error',reject);child.on('close',done);});}
  finally{process.off('SIGINT',ownerStop);process.off('SIGTERM',ownerStop);}
  return collectFakeRun({config,paths,launchId,marker,startedAt,resumed:!!resumed},errors);
}
export function collectFakeRun({config,paths,launchId,marker,startedAt},errors=''){
  if(!existsSync(paths.launchDone))throw fault('ISOLATION',`Launcher failed without cleanup record: ${errors.slice(0,1000)}`);
  const ended=readJson(paths.launchDone),statePath=join(paths.run,'state.json');
  const state=existsSync(statePath)?readJson(statePath):{packageId:config.packageId,baseSha:config.baseSha,round:1};
  const evidence=new Evidence(paths.run);
  for(const path of [paths.launchReady,paths.launchDone,join(paths.run,`${launchId}.launch.json`),join(paths.run,`${launchId}.transport.json`),join(paths.run,`${launchId}.coordinator.stdout`),join(paths.run,`${launchId}.coordinator.stderr`)])if(existsSync(path))evidence.index(relative(paths.run,path).replaceAll('\\','/'),readFileSync(path),false);
  if(!ended.empty || !ended.sweep || ended.sweep.result!=='PASS'){
    state.stop='ISOLATION';state.evidenceIncomplete=[...new Set([...(state.evidenceIncomplete||[]),'Launcher cleanup or sweep unconfirmed'])];
    evidence.write('state.json',state,{mutable:true});evidence.write(`finalization-${launchId}.md`,report(state),{raw:true});
    return{exit:EXIT.ISOLATION,output:JSON.stringify({stop:state.stop,run:paths.run,launcher:ended})+'\n'};
  }
  // The coordinator cannot release the mutex while its launcher is still alive.
  // Only this parent, after launcher exit and cleanup proof, archives its epoch.
  if(existsSync(paths.completion)){
    const lock=join(config.evidenceRoot,'global.lock');
    if(existsSync(lock)){
      let owner;try{owner=readLock(lock);}catch(error){if(error.code!=='LOCK_DAMAGED')throw error;}
      if(owner?.runId===marker && owner.paths?.launchReady===paths.launchReady){
        if(lockState(owner,inspector(join(paths.run,'final-inspection')))!=='LOCK_STALE')throw fault('LOCK_HELD','Launcher owner is not confirmed dead');
        const archive=join(paths.run,`finished-${launchId}.lock`);renameSync(lock,archive);evidence.index(relative(paths.run,archive).replaceAll('\\','/'),readFileSync(archive),false);
        evidence.write(`finalization-${launchId}.json`,{launcherStopped:true,sweep:'PASS',lockReleased:true,at:new Date().toISOString()});
      }
    }
  }
  if(!existsSync(paths.completion)){
    state.stop=ended.reason==='owner_interrupt'?'OWNER_INTERRUPT':ended.reason==='launcher_total_deadline'?'TIMEOUT':'AGENT_ERROR';
    const gitDir=readJson(join(paths.run,'worktree.json')).gitDir;
    const git=new Git({executable:config.gitExecutable,root:paths.worktree,gitDir,emptyConfig:config.emptyConfig,emptyHooks:config.emptyHooks,pointer:join(paths.worktree,'.git')});
    const crashDir=join(paths.run,'crashes',randomUUID());fingerprint(git,{base:config.baseSha,packageId:config.packageId,round:1,directory:crashDir});
    evidence.write('crash-recovery.json',{gitDir,signature:treeSignature(git,config.baseSha),marker,startedAt,crashDir},{mutable:true});
    for(const path of regularTree(crashDir))evidence.index(relative(paths.run,path).replaceAll('\\','/'),readFileSync(path),false);
    evidence.write('state.json',{...state,reconstructed:true},{mutable:true});evidence.write(`reconstructed-${launchId}.md`,report(state,{reconstructed:true}),{raw:true});
  }
  return {exit:EXIT[state.stop]??EXIT.AGENT_ERROR,output:JSON.stringify({stop:state.stop,run:paths.run,worktree:paths.worktree,launcher:ended})+'\n'};
}

export async function executeFakeSession(transport) {
  const {config,paths,marker,startedAt}=transport;
  // This transport came from the gated CLI. Recheck all immutable bindings.
  if(process.env.DYE_SUPERVISOR_TEST!=='1' || config.mode!=='fake' || !config.testHarness)throw fault('NOT_APPROVED');
  for(const path of [config.repository,config.evidenceRoot,paths.run,paths.worktree])tempPath(path,config.osTemp);
  verifyConfig(config);
  const evidence=new Evidence(paths.run),pending=new Set();let git,ownedLock=false,clean=false;
  const launcher=await waitFor(paths.launchReady,Date.now()+5000);
  const indexTree=directory=>{for(const path of regularTree(directory))evidence.index(relative(paths.run,path).replaceAll('\\','/'),readFileSync(path),false);};
  async function dispatch(scenario,timeout,checkSpec=null,round=1,deadline=Date.now()+timeout){
    verifyConfig(config);
    const id=randomUUID(),request=join(paths.run,'spool',`${id}.request.json`),release=request+'.release';
    const fixture=checkSpec?checkSpec.args[0]:config.fixture;
    const args=checkSpec?[fixture]:[fixture,scenario,'--dye-run-marker='+marker,'--release-file='+release,'--fixture-round='+round,'--fixture-write='+join(paths.worktree,'docs','fixture.md')];
    const spec={kind:'fake',executable:process.execPath,fixture,fixtureHash:hash(readFileSync(fixture)),args,cwd:paths.worktree,
      stdout:request+'.stdout',stderr:request+'.stderr',ready:request+'.ready.json',done:request+'.done.json',release:checkSpec?null:release,
      parentPid:process.pid,parentCreated:String(launcher.created),stepMs:timeout,deadlineUtc:deadline,env:git.environment};
    atomic(request,spec);evidence.index(relative(paths.run,request).replaceAll('\\','/'),readFileSync(request),false);pending.add(request);
    const reply=await waitFor(request+'.reply.json',Date.now()+timeout+5000);pending.delete(request);
    for(const suffix of ['.stdout','.stderr','.ready.json','.done.json','.membership.json','.reply.json','.wrapper.stdout','.wrapper.stderr'])if(existsSync(request+suffix))evidence.index(relative(paths.run,request+suffix).replaceAll('\\','/'),readFileSync(request+suffix),false);
    if(!reply.empty || !reply.drainedBeforeFallback)throw fault('ISOLATION','Step needed backup cleanup or did not empty');
    const done=readJson(spec.done);
    if(done.reason==='wrapper_step_deadline')throw fault('TIMEOUT');
    if(!checkSpec){const membership=readJson(request+'.membership.json');if(!membership.j0Member || !membership.j1Member)throw fault('ISOLATION','Fake agent is not in both jobs');}
    return {exit:done.exit,output:readFileSync(spec.stdout,'utf8'),stderr:readFileSync(spec.stderr,'utf8')};
  }
  const packageBytes=()=>{verifyConfig(config);return readFileSync(config.packageFile);};
  const io={now:()=>Date.now(),evidence,packageBytes,approvedBytes:()=>readFileSync(config.approvedFile),
    acquireLock:async()=>{const owner={runId:marker,runFolder:paths.run,marker,fixture:config.fixture,startedAt,paths,node:{pid:process.pid,createdAt:String(launcher.created)},launcher:{pid:launcher.launcher,createdAt:String(launcher.launcherCreated)}};takeLock(join(config.evidenceRoot,'global.lock'),owner,inspector(join(paths.run,'process-evidence')));ownedLock=true;atomic(join(config.evidenceRoot,'active-run.json'),owner);evidence.write(`locks/${launcher.launcher}-${launcher.launcherCreated}.json`,owner);},
    auth:async()=>config.authFixture,
    prepare:async()=>{
      if(!existsSync(paths.worktree)){mkdirSync(dirname(paths.worktree),{recursive:true});trustedGit(config,['worktree','add','--detach',paths.worktree,config.baseSha]);}
      const pointer=readFileSync(join(paths.worktree,'.git'),'utf8').trim();
      if(!pointer.startsWith('gitdir: '))throw fault('INTEGRITY');const gitDir=resolve(pointer.slice(8));
      if(!gitDir.startsWith(join(config.repository,'.git','worktrees')))throw fault('INTEGRITY');
      git=new Git({executable:config.gitExecutable,root:paths.worktree,gitDir,emptyConfig:config.emptyConfig,emptyHooks:config.emptyHooks,pointer:join(paths.worktree,'.git')});
      if(!existsSync(join(paths.run,'worktree.json')))evidence.write('worktree.json',{gitDir,repository:config.repository,worktree:paths.worktree});
    },
    identity:async()=>git.identity(),integrity:async before=>git.assertIdentity(before),scope:async()=>git.assertScope(['docs/fixture.md']),
    implement:async(state,timeout,deadline)=>{
      let scenario=config.scenarios.implement[Math.min(state.round-1,config.scenarios.implement.length-1)];
      if(scenario==='crash-once'){
        const crashMarker=join(paths.run,'crash-once');
        if(!existsSync(crashMarker)){writeFileSync(crashMarker,'synthetic abrupt exit',{flag:'wx'});process.exit(99);}
        scenario='implemented';
      }
      const result=await dispatch(scenario,timeout,null,state.round,deadline);return parseAgentOutput(result.output,result.stderr,result.exit);
    },
    capture:async round=>{const directory=join(paths.run,'rounds',`r${round}`);const captured=fingerprint(git,{base:config.baseSha,packageId:config.packageId,round,directory});indexTree(directory);return captured.diffHash;},
    check:async(name,timeout,deadline)=>runCheck(name,{git,base:config.baseSha,node:process.execPath,execute:async spec=>{
      if(name==='diff-check'){try{git.run(['diff','--check']);return{exit:0,output:''};}catch(error){return{exit:1,output:error.message};}}
      return dispatch(null,timeout,spec,1,deadline);
    }}),
    signature:async()=>treeSignature(git,config.baseSha),
    snapshot:async round=>{const path=join(paths.run,'snapshots',`r${round}`);const hashes=snapshot(git,path);indexTree(path);return{path,hashes};},
    verifySnapshot:async saved=>verifySnapshot(saved.path,saved.hashes),
    review:async(state,timeout,deadline)=>{const scenario=config.scenarios.review[Math.min(state.round-1,config.scenarios.review.length-1)];const result=await dispatch(scenario,timeout,null,state.round,deadline);return parseAgentOutput(result.output,result.stderr,result.exit);},
    interrupted:()=>existsSync(paths.ownerStop),
    stopChildren:async()=>{
      for(const request of pending){if(!existsSync(request+'.cancel'))writeFileSync(request+'.cancel','cancel',{flag:'wx'});const reply=await waitFor(request+'.reply.json',Date.now()+5000);if(!reply.empty)throw fault('ISOLATION','Cancelled step did not drain');}
      const sweep=realSweep({marker,fixture:config.fixture,startedAt},join(paths.run,'process-evidence'));evidence.write(`sweep-${randomUUID()}.json`,sweep);
      if(sweep.result!=='PASS')throw fault('ISOLATION','Backstop sweep did not complete');
      clean=true;
    },
    archiveLock:async state=>{
      if(!clean)return; // An uncertain survivor keeps the global lock recoverable.
      if(ownedLock && state.stop==='READY'){
        trustedGit(config,['worktree','remove','--force',paths.worktree]);evidence.write('worktree-cleanup.json',{removed:true,path:paths.worktree});
      }
      // Parent releases it after this coordinator AND launcher have exited.
    }
  };
  const result=await runSession({...config,runId:marker,criteria:['C1'],resume:transport.resumed},io);
  evidence.write(relative(paths.run,paths.completion).replaceAll('\\','/'),{stop:result.state.stop,exit:result.exit,at:new Date().toISOString()});
  return result;
}
