import { readFileSync, existsSync, renameSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fakeCommand, atomic } from './fake-runtime.js';
import { loadFakeConfig, toolRoot } from './fake-config.js';
import { fault, hash, childEnvironment, inside, launchSpec } from './policy.js';
import { Evidence } from './evidence.js';
import { recordApproval, records, verifyApproval } from './approvals.js';
import { newBudget, stepBudget } from './budget.js';
import { takeLock, readLock, lockState } from './lock.js';
import { readJson, inspector, ancestry } from './processes.js';
import { EXIT } from './state.js';
import { syntheticAuth } from './auth.js';
import { probeMode, pathTuple, systemPowerShellPath, PROBE_REGISTRY, REGISTRY_HASH, readWire, writeWire, publishProbeRequest, indexed, reserveAttempt } from './probe-contract.js';

const runtimePins=config=>({node:hash(readFileSync(process.execPath)),powershell:hash(readFileSync(systemPowerShellPath(config))),git:config.gitHash});

function validateApproval(config) {
  for(const name of ['probe-approvals.jsonl','approvals.jsonl','approved-package.md'])pathTuple(join(config.evidenceRoot,name));
  const row = records(join(config.evidenceRoot,'probe-approvals.jsonl')).at(-1);
  verifyApproval(row,readFileSync(config.packageFile),readFileSync(join(config.evidenceRoot,'approved-package.md')),config);
  if(JSON.stringify(row.runtimePins)!==JSON.stringify(runtimePins(config)))throw fault('AGENT_VERSION','Approved synthetic runtime pins changed');
  if (row.configHash !== config.configHash || row.registryHash !== REGISTRY_HASH || row.mode !== 'fake' || row.cap !== config.probes.cap ||
      JSON.stringify(row.ids) !== JSON.stringify(config.probes.ids) || row.synthetic !== true) throw fault('NOT_APPROVED','Synthetic probe approval binding changed');
  return hash(JSON.stringify(row));
}
export async function platformCommand(args) {
  // Mode is checked before even parsing a config path; no live lookup/backend exists.
  const [mode,command,flag,path,...flags] = args; probeMode(mode);
  if (!['prepare','approve','status','run'].includes(command) || flag !== '--spec' || !path || flags.some(f => f !== '--fixture-consent')) throw fault('NOT_APPROVED');
  systemPowerShellPath(); // A1: refuse untrusted locations before config/Git/ancestry or hashing.
  const config = loadFakeConfig(path);
  systemPowerShellPath(config);
  if (!config.probes) throw fault('NOT_APPROVED','Explicit synthetic probe list required');
  if (command === 'prepare') return {exit:0,output:JSON.stringify({mode:'fake',ids:config.probes.ids,registryHash:REGISTRY_HASH,realResults:'UNVERIFIED',apply:'unimplemented'})+'\n'};
  if (command === 'approve') {
    if (existsSync(join(config.evidenceRoot,'probe-approvals.jsonl'))) throw fault('NOT_APPROVED','Approval already exists');
    // Observe only typed ancestry metadata. Synthetic consent is explicitly not owner authentication.
    ancestry(process.pid,join(config.evidenceRoot,'ancestry'));
    await fakeCommand('approve',path,{fixtureConsent:flags.includes('--fixture-consent')});
    const row = recordApproval(join(config.evidenceRoot,'probe-approvals.jsonl'),{
      packageId:config.packageId,phase:config.phase,baseSha:config.baseSha,bundle:config.bundle,packageHash:hash(readFileSync(config.packageFile)),
      configHash:config.configHash,registryHash:REGISTRY_HASH,mode:'fake',cap:config.probes.cap,ids:config.probes.ids,runtimePins:runtimePins(config),synthetic:true
    },{tty:true,enteredId:config.packageId,enteredPhase:config.phase});
    return {exit:0,output:JSON.stringify({approved:true,synthetic:true,approvalHash:hash(JSON.stringify(row))})+'\n'};
  }
  const approvalHash = validateApproval(config);
  if (command === 'status') {
    const active = readJson(join(config.evidenceRoot,'active-run.json'));
    return {exit:0,output:JSON.stringify(readJson(join(active.paths.run,'state.json')))+'\n'};
  }
  // One run per synthetic approval, reserved before launch. Crash/recovery cannot
  // quietly create a fresh deadline or replenish attempts using the same consent.
  new Evidence(config.evidenceRoot).write('probe-run-reserved.json',{approvalHash,synthetic:true,reservedAt:Date.now()});
  return fakeCommand('run',path,{prepareProbe:(transport,legacy,transportPath)=>{
    const path=join(transport.paths.run,'probe-manifest.json');
    const env=childEnvironment(process.env,config.osTemp,transport.marker,[]);
    env.DYE_SUPERVISOR_TEST='1'; env.DYE_A5_OPERATOR='0';
    const row={schema:1,type:'manifest',mode:'fake',run_id:transport.marker,registry_hash:REGISTRY_HASH,approval_hash:approvalHash,
      config_path:config.configPath,config_hash:config.configHash,transport_path:transportPath,transport_hash:hash(readFileSync(transportPath)),
      executable:process.execPath,executable_hash:hash(readFileSync(process.execPath)),fixture:join(toolRoot,'coordinator.js'),fixture_hash:hash(readFileSync(join(toolRoot,'coordinator.js'))),
      powershell_executable:systemPowerShellPath(config),powershell_hash:runtimePins(config).powershell,git_executable:config.gitExecutable,git_hash:config.gitHash,
      agent_fixture:config.fixture,repository:config.repository,cwd:transport.paths.run,stdout:legacy.stdout,stderr:legacy.stderr,ready:legacy.ready,done:legacy.done,
      steps_dir:legacy.stepsDir,total_ms:config.totalMs,grace_ms:1000,deadline_utc:transport.startedAt+config.totalMs,
      marker:transport.marker,started_at:transport.startedAt,owner_stop:legacy.ownerStop,lock_path:join(config.evidenceRoot,'global.lock'),
      ...indexed('argv',[join(toolRoot,'coordinator.js'),'--sealed-probe',path,'--dye-run-marker='+transport.marker]),...indexed('env',Object.entries(env).sort())};
    // Hash goes in trusted script arguments; the coordinator receives it separately as argv.
    const manifestHash=writeWire(path,row);
    return {path,hash:manifestHash,beforeLaunch:()=>{validateApproval(config);}};
  },collectProbe:(run,errors)=>collectProbe(run,errors)});
}

function collectProbe({config,paths,marker},errors) {
  if (!existsSync(paths.launchDone)) throw fault('ISOLATION','Probe launcher did not record cleanup: '+errors.slice(0,400));
  const done=readJson(paths.launchDone),evidence=new Evidence(paths.run);
  for(const name of ['probe-manifest.json',relative(paths.run,paths.launchReady),relative(paths.run,paths.launchDone)]) {
    if(existsSync(join(paths.run,name)))evidence.index(name.replaceAll('\\','/'),readFileSync(join(paths.run,name)),false);
  }
  if(!done.empty || done.sweep?.result!=='PASS') throw fault('ISOLATION','Probe cleanup unconfirmed; lock retained');
  if(!existsSync(paths.completion)) throw fault('INTEGRITY','Probe coordinator stopped; preserve evidence and recover lock');
  const lock=join(config.evidenceRoot,'global.lock'),owner=readLock(lock);
  if(owner.runId!==marker || lockState(owner,inspector(join(paths.run,'final-inspection')))!=='LOCK_STALE')throw fault('LOCK_HELD');
  renameSync(lock,join(paths.run,'finished-probe.lock'));
  evidence.index('finished-probe.lock',readFileSync(join(paths.run,'finished-probe.lock')),false);
  const state=readJson(join(paths.run,'state.json'));
  return {exit:EXIT[state.stop]??99,output:JSON.stringify({run:paths.run,...state})+'\n'};
}

export async function executeProbeSession(manifestPath,expectedHash) {
  if(process.env.DYE_SUPERVISOR_TEST!=='1')throw fault('NOT_APPROVED');
  const root=readWire(manifestPath,expectedHash),config=loadFakeConfig(root.config_path);
  if(root.type!=='manifest' || root.mode!=='fake' || root.registry_hash!==REGISTRY_HASH || root.config_hash!==config.configHash ||
      root.approval_hash!==validateApproval(config) || root.transport_hash!==hash(readFileSync(root.transport_path)))throw fault('NOT_APPROVED');
  const transport=readJson(root.transport_path),{paths,marker,startedAt}=transport;
  if(marker!==root.run_id || root.cwd!==paths.run.toUpperCase() || !inside(config.evidenceRoot,paths.run) || root.deadline_utc!==startedAt+config.totalMs)throw fault('INTEGRITY');
  const evidence=new Evidence(paths.run),attempts=[],budget=newBudget(startedAt,config.totalMs);
  const launcher=readJson(paths.launchReady),lock=join(config.evidenceRoot,'global.lock');
  const owner={runId:marker,runFolder:paths.run,marker,fixture:config.fixture,startedAt,paths,node:{pid:process.pid,createdAt:String(launcher.created)},launcher:{pid:launcher.launcher,createdAt:String(launcher.launcherCreated)}};
  takeLock(lock,owner,inspector(join(paths.run,'process-evidence')));
  evidence.write('lock-owner.json',owner);atomic(join(config.evidenceRoot,'active-run.json'),owner);
  let stop='READY'; const results=[];
  try {
    for(const probeId of config.probes.ids) {
      if(validateApproval(config)!==root.approval_hash || hash(readFileSync(manifestPath))!==expectedHash)throw fault('NOT_APPROVED');
      const requestId=randomUUID(),scenario=PROBE_REGISTRY[probeId].scenario;
      const timeout=stepBudget(budget,probeId,config.stepMs,Date.now());
      reserveAttempt(evidence,{budget,attempts,cap:config.probes.cap,requestId,probeId,now:Date.now(),binding:expectedHash});
      const request=join(paths.run,'spool',requestId+'.request.json');
      const release=request+'.release';
      const target=launchSpec('fake-agent',{mode:'fake',node:process.execPath,fixture:config.fixture,fixtureRoot:dirname(config.fixture),fixtureHash:config.fixtureHash},scenario);
      const row={schema:1,type:'request',mode:'fake',run_id:marker,request_id:requestId,probe_id:probeId,manifest_hash:expectedHash,registry_hash:REGISTRY_HASH,
        executable:target.executable,executable_hash:root.executable_hash,fixture:config.fixture,fixture_hash:config.fixtureHash,cwd:config.repository,
        stdout:request+'.stdout',stderr:request+'.stderr',ready:request+'.ready.json',done:request+'.done.json',release,
        parent_pid:process.pid,parent_created:String(launcher.created),step_ms:timeout,deadline_utc:Math.min(root.deadline_utc,Date.now()+timeout),
        ...indexed('argv',[config.fixture,scenario,'--dye-run-marker='+marker,'--release-file='+release])};
      publishProbeRequest(request,row);evidence.index('spool/'+requestId+'.request.json',readFileSync(request),false);
      evidence.index('spool/'+requestId+'.request.json.published',readFileSync(request+'.published'),false);
      const until=Date.now()+timeout+5000;
      while(!existsSync(request+'.reply.json')){if(Date.now()>=until)throw fault('TIMEOUT');await delay(20);}
      const reply=readJson(request+'.reply.json');
      if(!reply.empty || !reply.drainedBeforeFallback)throw fault('ISOLATION');
      const completed=readJson(row.done),member=readJson(request+'.membership.json');
      if(!member.j0Member || !member.j1Member)throw fault('ISOLATION');
      if(completed.reason==='wrapper_step_deadline')throw fault('TIMEOUT');
      if(completed.exit!==0)throw fault('AUTH_OR_USAGE');
      const result=JSON.parse(readFileSync(row.stdout,'utf8'));
      let safe;
      if(probeId==='auth')safe=syntheticAuth(result);
      else if(probeId==='version') { if(JSON.stringify(result)!==JSON.stringify({schema:1,version:'fixture-v1',mode:'fake'}))throw fault('AGENT_VERSION');safe=result; }
      else {if(JSON.stringify(result)!==JSON.stringify({schema:1,result:'REFUSED',synthetic:true}))throw fault('INTEGRITY');safe=result;}
      results.push({probeId,result:'PASS',synthetic:true,realResult:'UNVERIFIED',safe});
      // Index only validated, redacted auth status. Raw fixture output is not copied to a report.
      evidence.write('results/'+requestId+'.json',results.at(-1));
      for(const suffix of ['.ready.json','.done.json','.membership.json','.reply.json','.consumed.json','.started.json']){
        evidence.index('spool/'+requestId+'.request.json'+suffix,readFileSync(request+suffix),false);
      }
    }
  } catch(error) { stop=Object.hasOwn(EXIT,error.code)?error.code:'INTEGRITY';evidence.write('failure.json',{code:stop}); }
  // The launcher owns cleanup after coordinator exit. Its final sweep is required
  // by collectProbe before the mutex is released; do not launch another inspector
  // from inside this deliberately sealed coordinator environment.
  const state={stop,results,synthetic:true,realResults:'UNVERIFIED',attempts:attempts.length,deadline:budget.originalDeadlineUtc};
  evidence.write('state.json',state);evidence.write(relative(paths.run,paths.completion).replaceAll('\\','/'),{stop});
  return {exit:EXIT[stop]??99,state};
}
