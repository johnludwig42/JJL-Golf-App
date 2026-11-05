import { execFile } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify, TextDecoder } from 'node:util';
import { childEnvironment, fault, hash } from './policy.js';
import { bindInventoryApproval, indexed, INVENTORY_TEMPLATES, inventoryRegistryHash, pathTuple, publishProbeRequest, readWire, systemPowerShellPath, writeWire } from './probe-contract.js';
import { Evidence } from './evidence.js';
import { takeLock } from './lock.js';
import { validateAuthProjection } from './auth.js';
import { inspector, probeJobMembership, readJson } from './processes.js';

const mode = 'live-nonmodel';
// Inventory observation is not platform acceptance. This projection deliberately
// cannot promote fixture records or bootstrap auth into a real probe PASS.
export function buildStage2Result(record) {
  const refuse = () => { throw fault('NOT_APPROVED', 'Real inventory evidence required'); };
  if (!record || record.mode !== mode || record.run_class !== 'live-real' ||
      !Object.hasOwn(INVENTORY_TEMPLATES, record.operation) ||
      record.inventoryRegistryHash !== inventoryRegistryHash) refuse();
  const template = INVENTORY_TEMPLATES[record.operation];
  const result = { schema: 1, mode, run_class: 'live-real', templateId: record.operation,
    inventoryRegistryHash, platformAcceptance: 'UNVERIFIED', authMode: 'UNVERIFIED (bootstrap)' };
  if (template.route === 'memory-shape') {
    const shape = record.shape;
    if (!shape || shape.mode !== mode || shape.run_class !== 'live-real' || !Number.isInteger(shape.exitCode) ||
        !Number.isSafeInteger(shape.stdoutTotal) || shape.stdoutTotal < 0 ||
        !Number.isSafeInteger(shape.stderrTotal) || shape.stderrTotal < 0 ||
        !Number.isSafeInteger(shape.durationMs) || shape.durationMs < 0) refuse();
    validateAuthProjection(shape.projection);
    const safeRecord = { ...result, status: shape.projection.stop ? 'STOPPED' : 'OBSERVED (shape only)',
      exitCode: shape.exitCode, byteCounts: {stdout:shape.stdoutTotal,stderr:shape.stderrTotal},
      durationMs: shape.durationMs, projection: JSON.parse(JSON.stringify(shape.projection)) };
    return {...safeRecord,shapeHash:hash(JSON.stringify(safeRecord))};
  }
  // Raw help/version output is not copied by the result builder. Publishing it
  // requires the separate fixed-pattern confidentiality scan.
  if (!record.done || !Number.isInteger(record.done.exit)) refuse();
  return { ...result, status: record.done.exit === 0 ? 'OBSERVED' : 'NOT_RUN', exitCode: record.done.exit };
}
// This scanner is for file-routed inventory output only. Auth never reaches it:
// auth pipes are projected in native memory and no raw digest is constructed.
export function scanInventoryOutput(bytes) {
  let text;
  try { text = new TextDecoder('utf-8', {fatal:true}).decode(bytes); }
  catch { return {status:'QUARANTINED',reason:'NON_UTF8'}; }
  const patterns = [
    ['SENTINEL', /WP-AUTO-02-SENTINEL-[0-9a-f]{32}/],
    ['JWT_LIKE', /eyJ[A-Za-z0-9_-]{10,}\./],
    ['SECRET_PREFIX', /sk-/], ['BEARER', /Bearer /], ['PEM', /-----BEGIN/],
    ['LONG_ENCODED_RUN', /[A-Za-z0-9+/_=-]{32,}/]
  ];
  for (const [reason,pattern] of patterns) if (pattern.test(text)) return {status:'QUARANTINED',reason};
  return {status:'CLEAR'};
}

// Prepare every publication before writing any one of them. A confidentiality
// failure produces no ordinary-view artifact, including no raw-output digest.
export function inventoryPublication(record, streams) {
  const projection = buildStage2Result(record);
  if (INVENTORY_TEMPLATES[record.operation].route === 'memory-shape') {
    if (streams !== undefined) throw fault('NOT_APPROVED','Auth raw streams are forbidden');
    return {status:'READY',artifacts:[{suffix:'auth-shape-'+record.operation+'.json',value:projection}]};
  }
  if (!streams || !Buffer.isBuffer(streams.stdout) || !Buffer.isBuffer(streams.stderr)) {
    throw fault('EVIDENCE_WRITE','Both restricted output streams are required');
  }
  for (const bytes of [streams.stdout,streams.stderr]) {
    const scan=scanInventoryOutput(bytes);
    if(scan.status!=='CLEAR')return scan;
  }
  const unknown=[streams.stdout,streams.stderr].some(bytes=>/unknown command/i.test(bytes.toString('utf8')));
  const projected=unknown ? {...projection,status:'NOT_RUN',reason:'UNKNOWN_COMMAND'} : projection;
  const artifacts=[{suffix:'results.json',value:projected}];
  if (projected.status==='OBSERVED' && /^[cl]-h[123]$/.test(record.operation)) {
    artifacts.push({suffix:'help-'+record.operation+'.txt',value:Buffer.from(streams.stdout),raw:true});
  }
  return {status:'READY',artifacts};
}

export function publishInventoryArtifacts(record, streams, root, runId) {
  if (!/^dye-live-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(runId)) {
    throw fault('EVIDENCE_WRITE','Bound inventory run ID required');
  }
  const publication=inventoryPublication(record,streams);
  if(publication.status!=='READY')return publication;
  const ordinary=new Evidence(root);
  for(const artifact of publication.artifacts) {
    ordinary.write('stage2-'+runId+'-'+artifact.suffix,artifact.value,{raw:artifact.raw===true});
  }
  return {status:'PUBLISHED',projection:publication.artifacts[0].value};
}

const runClass = 'live-test';
const fixture = fileURLToPath(new URL('../../../tests/fixtures/collab-supervisor/fake-cli.mjs', import.meta.url));
const launcher = fileURLToPath(new URL('../launch.ps1', import.meta.url));
const coordinator = fileURLToPath(new URL('../coordinator.js', import.meta.url));
const fixtureHash = '8001DAC8B3AECE12862DC8A8CA1ABA69338DF30205A145F0D1773669F606AB96';
const nodeHash = '46BA90A735E256C76AF1CB1FF799876B4B18140F9A93418DE8ECE7965B1AD512';
const payloadHash = 'CE09F5AD996B15EE5589E7B97EF5FAF232F8AB6CFECDA630B31EC84BB11BC4AA';
const templates = Object.freeze({
  ...INVENTORY_TEMPLATES,
  auth: { route: 'memory-shape', argv: ['auth'] },
  version: { route: 'file', argv: ['version'] },
  overflow: { route: 'memory-shape', argv: ['overflow'] },
  hold: { route: 'memory-shape', argv: ['hold'], timeoutMs:6000 },
  'cancel-hold': { route: 'memory-shape', argv: ['hold'], timeoutMs:15000 },
  'parent-hold': { route: 'memory-shape', argv: ['hold'], timeoutMs:15000 },
  'before-acl': { route: 'memory-shape', argv: ['auth'], timeoutMs:15000 },
  'after-acl': { route: 'memory-shape', argv: ['auth'], timeoutMs:15000 },
  'attest-fault': { route: 'memory-shape', argv: ['hold'], timeoutMs:6000 },
  'pipe-hold': { route: 'memory-shape', argv: ['pipe-hold'], timeoutMs:15000 },
  ...Object.fromEntries(['limit','stderr-limit','stderr-overflow'].map(id=>[id,{route:'memory-shape',argv:[id]}])),
  marker: { route: 'memory-shape', argv: ['marker'] },
  'ten-mib': { route: 'memory-shape', argv: ['ten-mib'] },
  ...Object.fromEntries(['nested-safe','nested-private','jwt','long-hex','long-base64','invalid-utf8','duplicate','sensitive-key','not-json']
    .map(id=>[id,{route:'memory-shape',argv:[id]}])),
  'payload-identity': { route: 'file', argv: ['identity'] }
});
const templateArgs = operation => {
  const template = templates[operation];
  return template.role ? [template.role, ...template.argv] : template.argv;
};
const templateHash = (operation, targetHash = fixtureHash, real = false) =>
  hash([operation, templates[operation].route, targetHash, ...(real ? INVENTORY_TEMPLATES[operation].argv : templateArgs(operation))].join('|'));
const registryHash = hash(JSON.stringify([inventoryRegistryHash, ...Object.keys(templates).map(operation => templateHash(operation))]));
const execute = promisify(execFile);
const fileHash = path => hash(readFileSync(path));
export function compareInventoryObservations(before, after, { startedFiletime, endedFiletime, sandboxSids, installFolder }) {
  const missing = () => ({ result: 'NOT_RUN', reason: 'inventory observation incomplete' });
  const integer = value => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value);
  if (!before || !after || !integer(startedFiletime) || !integer(endedFiletime) ||
      BigInt(endedFiletime) < BigInt(startedFiletime) || !Array.isArray(sandboxSids) || !sandboxSids.length ||
      typeof installFolder !== 'string' || !installFolder) return missing();
  for (const snapshot of [before, after]) {
    if (snapshot.status !== 'OK' || !snapshot.files?.image || !Array.isArray(snapshot.files.install) ||
        !Array.isArray(snapshot.files.profiles) || !snapshot.resolution?.path || !Array.isArray(snapshot.paths) ||
        !Array.isArray(snapshot.system?.users) || !Array.isArray(snapshot.system.groups) ||
        !Array.isArray(snapshot.system.sandboxMembers) || !Array.isArray(snapshot.system.firewall) ||
        snapshot.processes?.Status !== 'OK' || !Array.isArray(snapshot.processes.Processes)) return missing();
    for (const row of snapshot.processes.Processes) {
      if (row.Error || !integer(row.CreatedFiletime) || !Number.isInteger(row.Pid) || row.Pid <= 0 ||
          !Number.isInteger(row.ParentPid) || row.ParentPid <= 0 || !integer(row.ParentCreatedFiletime) ||
          BigInt(row.ParentCreatedFiletime) > BigInt(row.CreatedFiletime) ||
          !/^S-1-[0-9-]+$/.test(row.OwnerSid ?? '') || !/^[A-Fa-f0-9]{64}$/.test(row.ImageSha256 ?? '') ||
          typeof row.Image !== 'string' || !row.Image) return missing();
    }
  }
  if (before.processes.Processes.some(row => sandboxSids.includes(row.OwnerSid))) {
    return { result: 'NOT_RUN', reason: 'sandbox users busy' };
  }
  const changed = ['files', 'resolution', 'paths', 'system'].filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  const survivors = after.processes.Processes.filter(row => {
    const created = BigInt(row.CreatedFiletime);
    return created >= BigInt(startedFiletime) && created <= BigInt(endedFiletime) &&
      (sandboxSids.includes(row.OwnerSid) || row.Image.toUpperCase().startsWith(installFolder.toUpperCase() + '\\'));
  }).map(row => ({ pid:row.Pid, createdFiletime:row.CreatedFiletime, ownerSid:row.OwnerSid,
    imageSha256:row.ImageSha256,
    ...(sandboxSids.includes(row.OwnerSid) ? {image:row.Image} : {}) }));
  return changed.length || survivors.length ? { result: 'FAIL', reason: 'inventory side effects observed', changed, survivors } :
    { result: 'PASS', changed, survivors };
}
export function inventoryTransportBundleHash() {
  const paths = ['../coordinator.js', '../launch.ps1', '../run-step.ps1',
    './live-probes.js', './probe-contract.js', './probe-transport.ps1', './broker.ps1',
    './windows-job.ps1', './auth-shape.ps1', './auth.js', './job-attest.ps1', './identity-collector.ps1', './sweep.ps1',
    './stage2-area.ps1', './policy.js', './evidence.js', './lock.js', './processes.js'];
  return hash(paths.map(path => path + ' ' + fileHash(fileURLToPath(new URL(path, import.meta.url))) + '\n').join(''));
}
function requireTest(condition, message) {
  if (!condition) throw fault('NOT_PLATFORM_ACCEPTED', message);
}
function assertEnvironment() {
  requireTest(!Object.hasOwn(process.env, 'DYE_SUPERVISOR_TEST') && !Object.hasOwn(process.env, 'DYE_A5_OPERATOR'), 'Live mode rejects test flags');
}
function fixturePath(path, { output = false } = {}) {
  const canonical = pathTuple(path, { output });
  requireTest(canonical.startsWith(pathTuple(process.env.TEMP) + '\\') &&
    !canonical.startsWith('C:\\PROJECTS\\'), 'Live test controls must be in disposable Temp fixtures');
  return canonical;
}
function protectedControlPath(path) {
  const canonical = pathTuple(path);
  requireTest(canonical.startsWith('C:\\PROJECTS\\DYE-LEDGER-EVIDENCE\\_STAGE2\\') ||
    canonical === 'C:\\PROJECTS\\DYE-LEDGER-EVIDENCE\\_STAGE2', 'Protected inventory control path required');
  return canonical;
}
function assertEmptyAttestation(run, job, nonce) {
  const records = readFileSync(join(run, 'jobs', job + '-attest.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  let previous = '0'.repeat(64);
  for (const [seq, entry] of records.entries()) {
    const record = entry.record;
    requireTest(record.job === job && record.runNonce === nonce && record.seq === seq &&
      record.previous === previous && entry.hash === hash(JSON.stringify(record)), 'Invalid job evidence chain');
    previous = entry.hash;
  }
  const final = records.at(-1)?.record;
  requireTest(final?.phase === 'final' && final.status === 'OK' &&
    final.sample?.activeProcesses === 0 && final.sample.members.length === 0, job + ' cleanup is unverified');
  return records;
}

// Stage 2a exercises only test-fixture. Inventory is separately approval-bound;
// its controls cannot be supplied from a disposable fixture or a test-mode flag.
export function liveProbeCommand(args) {
  const [command, flag, specPath] = args;
  requireTest(['test-fixture', 'inventory'].includes(command) && flag === '--spec' && !!specPath && args.length === 3, 'Live probe execution requires later approval');
  assertEnvironment();
  return runPrepared(specPath, command === 'inventory' ? 'live-real' : runClass);
}
export function appendStage2Journal(evidence,context,phase) {
  if(!['reserved','launch-intent','complete','failed'].includes(phase) ||
      !/^dye-live-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(context.runId) ||
      !Object.hasOwn(templates,context.operation) || !['live-test','live-real'].includes(context.executionClass)) {
    throw fault('EVIDENCE_WRITE','Bound journal context required');
  }
  if(evidence.verify().length)throw fault('INTEGRITY','Existing evidence changed; retain for review');
  const path=evidence.path('journal.jsonl');
  const old=existsSync(path)?readFileSync(path,'utf8'):'';
  if(old && !old.endsWith('\n'))throw fault('INTEGRITY','Incomplete Stage 2 journal; retain for review');
  let previous='0'.repeat(64),seq=0;
  for(const line of old ? old.slice(0,-1).split('\n') : []) {
    const row=JSON.parse(line);
    if(Object.keys(row).sort().join('|')!=='phase|previous|runId|run_class|schema|seq|templateId' || row.schema!==1 ||
        !['reserved','launch-intent','complete','failed'].includes(row.phase))throw fault('INTEGRITY','Unexpected Stage 2 journal record');
    if(row.seq!==seq++ || row.previous!==previous || row.runId!==context.runId || row.templateId!==context.operation ||
        row.run_class!==context.executionClass)throw fault('INTEGRITY','Stage 2 journal chain mismatch');
    previous=hash(line);
  }
  const row={schema:1,seq,previous,runId:context.runId,templateId:context.operation,run_class:context.executionClass,phase};
  evidence.bytes(path,JSON.stringify(row)+'\n',false);
  evidence.index('journal.jsonl',readFileSync(path),true);
  return row;
}

export function recordStage2Failure(context,error) {
  if(!context || !/^dye-live-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(context.runId) ||
      !Object.hasOwn(templates,context.operation) || !['live-test','live-real'].includes(context.executionClass)) {
    throw fault('EVIDENCE_WRITE','Bound failure context required');
  }
  const text=String(error?.message ?? '')+' '+String(error?.stderr ?? '');
  const drift=/\b(AREA_(?:MISSING|RECORD|REPLACED|PERMISSIONS|TOKEN|REPARSE|UNEXPECTED)|S1B_INVENTORY_CHANGED|PARENT_DEATH|ATTESTATION_INCOMPLETE)\b/.exec(text)?.[1];
  const reason=drift || (['NOT_APPROVED','NOT_PLATFORM_ACCEPTED','EVIDENCE_WRITE','AUTH_OR_USAGE','TIMEOUT'].includes(error?.code)?error.code:'RUN_FAILED');
  const names=['probe-run-reserved.json','manifest.json','launch-ready.json','launch-done.json','result.json',
    'jobs/J0-attest.jsonl','jobs/J1-attest.jsonl','jobs/J0-finish.json',
    'raw/'+context.operation+'.out','raw/'+context.operation+'.err'];
  const objects=names.map(name=>{
    try {
      const stat=lstatSync(join(context.run,name),{bigint:true});
      // Metadata is observational. Without a held native identity at failure,
      // a present object remains UNCERTAIN and is never cleanup authority.
      return {name,state:'UNCERTAIN',exists:true,type:stat.isSymbolicLink()?'link':stat.isFile()?'file':'other',size:stat.size.toString()};
    }catch(problem){return {name,state:problem.code==='ENOENT'?'ABSENT':'UNCERTAIN',exists:problem.code==='ENOENT'?false:null};}
  });
  const launched=objects.find(row=>row.name==='launch-ready.json').exists===true;
  const record={schema:1,mode,run_class:context.executionClass,runId:context.runId,templateId:context.operation,
    status:launched?'INVALID':'NOT_RUN',reason,objects,preserved:true,platformAcceptance:'UNVERIFIED'};
  const id=randomUUID();
  // Do not recreate a missing/replaced-with-link control path during failure.
  pathTuple(context.run);
  if(!lstatSync(context.run).isDirectory())throw fault('EVIDENCE_WRITE','Failure run is no longer a directory');
  const evidence=new Evidence(context.run);
  evidence.write('failed-'+id+'.json',record);
  appendStage2Journal(evidence,context,'failed');
  if(context.executionClass==='live-real'){
    const ordinary=new Evidence(context.ordinaryRoot);
    ordinary.write('stage2-'+context.runId+'-failed-'+id+'.json',record);
    ordinary.write('stage2-journal-'+context.runId+'.jsonl',readFileSync(evidence.path('journal.jsonl')),{raw:true,mutable:true});
  }
  return record;
}

async function runPrepared(specPath, executionClass) {
  const context={};
  try {return await runPreparedCore(specPath,executionClass,context);}
  catch(error) {
    if(context.run) {
      try {recordStage2Failure(context,error);}
      catch(evidenceError) {
        const failed=fault('EVIDENCE_WRITE','Run failed and its failure record could not be written; retain the run for review');
        failed.cause=error;failed.evidenceCause=evidenceError;throw failed;
      }
    }
    throw error;
  }
}
async function runPreparedCore(specPath, executionClass, context) {
  const real = executionClass === 'live-real';
  const controlPath = real ? protectedControlPath : fixturePath;
  controlPath(specPath);
  const spec = readJson(specPath);
  const operation = spec.operation;
  const run = controlPath(spec.cwd);
  const area = controlPath(spec.area_path);
  requireTest(spec.run_class === executionClass && Object.hasOwn(real ? INVENTORY_TEMPLATES : templates, operation) &&
    /^dye-live-[a-f0-9-]{36}$/.test(spec.run_id) &&
    run === join(area, 'RUNS', 'STAGE2-' + spec.run_id.toUpperCase()), 'Expected a disposable Stage 2 test run');
  requireTest(fileHash(fixture) === fixtureHash, 'Pinned fake CLI changed');
  requireTest(fileHash(process.execPath) === nodeHash, 'Pinned fixture Node runtime changed');
  requireTest(pathTuple(spec.approval_path).startsWith(join(area, 'APPROVALS') + '\\') &&
    fileHash(spec.approval_path) === spec.approval_hash, 'Fixture approval mismatch');
  const approval = readJson(spec.approval_path);
  requireTest(approval.mode === mode && approval.run_class === executionClass && approval.operation === operation &&
    approval.run_id === spec.run_id, 'Fixture approval does not bind this template and run');
  let target = process.execPath;
  if (Object.hasOwn(INVENTORY_TEMPLATES, operation)) {
    const role = INVENTORY_TEMPLATES[operation].role;
    if (real) {
      requireTest(typeof approval.inventory?.tools?.[role]?.path === 'string', 'Inventory target approval missing');
      target = approval.inventory.tools[role].path;
      pathTuple(target);
    }
    bindInventoryApproval(approval.inventory, {
      templateId: operation, runId: spec.run_id, runClass: executionClass,
      bundleHash: inventoryTransportBundleHash(), providerContactAllowed: real ? approval.inventory.providerContactAllowed : false,
      tools: { [role]: { path: target, sha256: fileHash(target) } }
    });
  }
  const evidence = new Evidence(run);
  Object.assign(context,{run,runId:spec.run_id,operation,executionClass,ordinaryRoot:join(dirname(area),'WP-AUTO-02')});
  evidence.write('probe-run-reserved.json', { mode, run_class: executionClass, approvalHash: spec.approval_hash });
  appendStage2Journal(evidence,context,'reserved');
  const steps = join(run, 'steps');
  mkdirSync(steps);
  mkdirSync(join(run, 'jobs'));
  mkdirSync(join(run, 'raw'));
  const powershell = systemPowerShellPath();
  const started = Date.now();
  const totalMs = (templates[operation].timeoutMs ?? 15000) + 20000;
  const manifest = {
    schema: 1, type: 'manifest', mode, run_class: executionClass, run_id: spec.run_id, marker: spec.run_id,
    probe_id: operation, registry_hash: registryHash, cwd: run, steps_dir: steps, started_at: started,
    total_ms: totalMs, grace_ms: 1000, deadline_utc: started + totalMs,
    approval_path: spec.approval_path, approval_hash: spec.approval_hash, area_path: spec.area_path,
    area_record_hash: spec.area_record_hash, area_volume: spec.area_volume, area_file_id: spec.area_file_id,
    run_dir_file_id: spec.run_dir_file_id, approval_file_id: spec.approval_file_id,
    executable: process.execPath, executable_hash: fileHash(process.execPath), fixture, fixture_hash: fixtureHash,
    target_executable: target, target_hash: fileHash(target),
    inventory_registry_hash: inventoryRegistryHash, inventory_bundle_hash: inventoryTransportBundleHash(),
    powershell_executable: powershell, powershell_hash: fileHash(powershell), transport_hash: fileHash(coordinator),
    auth_shape_hash: fileHash(fileURLToPath(new URL('./auth-shape.ps1', import.meta.url))),
    attest_hash: fileHash(fileURLToPath(new URL('./job-attest.ps1', import.meta.url))),
    identity_hash: fileHash(fileURLToPath(new URL('./identity-collector.ps1', import.meta.url))),
    ready: join(run, 'launch-ready.json'), done: join(run, 'launch-done.json'), lock_path: join(run, 'global.lock'),
    stdout: join(run, 'coordinator.out'), stderr: join(run, 'coordinator.err'), owner_stop: join(run, 'owner-stop'),
    ...indexed('argv', [coordinator, '--sealed-live-probe'])
  };
  if (operation === 'payload-identity') {
    manifest.worktree = mkdtempSync(join(tmpdir(), 'dye-stage2-payload-'));
    manifest.payload_hash = payloadHash;
  }
  const manifestPath = join(run, 'manifest.json');
  const digest = writeWire(manifestPath, manifest, mode);
  appendStage2Journal(evidence,context,'launch-intent');
  await execute(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcher,
    '-SpecPath', manifestPath, '-ProbeMode', mode, '-ManifestHash', digest], {
    cwd: run, env: childEnvironment(process.env, process.env.TEMP, spec.run_id), windowsHide: true, timeout: totalMs + 10000
  });
  const complete = readJson(manifest.done);
  if(!existsSync(join(run,'result.json'))){
    const receipts=readdirSync(steps).filter(name=>/^[a-f0-9-]{36}\.request\.json\.done\.json$/i.test(name));
    if(receipts.length===1){
      const receipt=readJson(join(steps,receipts[0]));
      if(receipt.reason!=='wrapper_parent_death' && receipt.attestationComplete===false)
        throw fault('NOT_PLATFORM_ACCEPTED','ATTESTATION_INCOMPLETE');
    }
  }
  // The coordinator is the wrapper's parent. J0 can stop the wrapper before it
  // flushes a stop-only shape. Preserve the bounded launcher receipt as failure
  // evidence; missing output must never be promoted to a successful observation.
  if(complete.reason==='node_exited' && complete.exit!==0 && complete.empty===true &&
      !existsSync(join(run,'result.json')))throw fault('NOT_PLATFORM_ACCEPTED','PARENT_DEATH');
  const result = readJson(join(run, 'result.json'));
  const attestationFinish = readJson(join(run, 'jobs', 'J0-finish.json'));
  requireTest(attestationFinish.complete === true && attestationFinish.runNonce === spec.run_id,
    'Outer job attestation did not complete');
  const outer = assertEmptyAttestation(run, 'J0', spec.run_id);
  assertEmptyAttestation(run, 'J1', spec.run_id);
  const record = readJson(join(run, 'jobs', 'J0-identity.json'));
  const identity = record.identity;
  const ready = readJson(manifest.ready);
  const membership = probeJobMembership({ pid: identity?.Pid, createdAt: identity?.CreatedFiletime },
    outer.map(entry => entry.record));
  requireTest(record.runNonce === spec.run_id && identity && !identity.Error && identity.Pid === ready.pid &&
    identity.ParentPid === ready.launcher && identity.CreatedFiletime === ready.created &&
    identity.ParentCreatedFiletime === ready.launcherCreated &&
    identity.ImageSha256 === nodeHash && membership?.membership === 'J0', 'Fixture identity and job membership could not be joined');
  requireTest(result.mode === mode && result.run_class === executionClass && complete.empty && complete.exit === 0, 'Live fixture cleanup is unverified');
  if (real) {
    const before = readJson(join(run, 'inventory-before.json'));
    const after = readJson(join(run, 'inventory-after.json'));
    const scope = approval.inventory.observation;
    const role = INVENTORY_TEMPLATES[operation].role;
    const comparison = compareInventoryObservations(before, after, {
      startedFiletime: before.observedFiletime, endedFiletime: after.observedFiletime,
      sandboxSids: scope?.sandboxSids, installFolder: scope?.installFolders?.[role]
    });
    evidence.write('inventory-comparison.json', comparison);
    requireTest(comparison.result === 'PASS', 'Inventory side effects or incomplete observation; review required');
    result.inventoryObservation = comparison;
    let streams;
    if (INVENTORY_TEMPLATES[operation].route === 'file') {
      streams={stdout:readFileSync(join(run,'raw',operation+'.out')),stderr:readFileSync(join(run,'raw',operation+'.err'))};
    }
    const publication=inventoryPublication(result,streams);
    if(publication.status!=='READY') {
      evidence.write('confidentiality-failure.json',{status:'FAIL',reason:publication.reason,templateId:operation});
      throw fault('EVIDENCE_WRITE','Inventory output quarantined; no ordinary projection published');
    }
    const ordinaryRoot=join(dirname(area),'WP-AUTO-02');
    publishInventoryArtifacts(result,streams,ordinaryRoot,spec.run_id);
    const ordinary=new Evidence(ordinaryRoot);
    ordinary.write('stage2-'+spec.run_id+'-observe.json',comparison);
    appendStage2Journal(evidence,context,'complete');
    ordinary.write('stage2-journal-'+spec.run_id+'.jsonl',readFileSync(evidence.path('journal.jsonl')),{raw:true,mutable:true});
    // Only this validated projection reaches terminal/ordinary callers. The full
    // run record, paths and raw files remain in the protected view.
    return {exit:0,output:JSON.stringify(publication.artifacts[0].value)+'\n'};
  }
  if (operation === 'payload-identity') {
    const before = readJson(join(run, 'payload-before.json'));
    const after = readJson(join(run, 'payload-after.json'));
    requireTest(JSON.stringify(before) === JSON.stringify(after) && before.sha256 === payloadHash, 'Deployed payload changed');
  }
  appendStage2Journal(evidence,context,'complete');
  return { exit: 0, output: JSON.stringify(result) + '\n' };
}

export async function executeLiveProbeSession(manifestPath, digest) {
  assertEnvironment();
  requireTest(/^[A-F0-9]{64}$/.test(digest), 'Fixture manifest digest required');
  const root = readWire(manifestPath, digest, { mode });
  const real = root.run_class === 'live-real';
  const resolveControl = path => {
    if (!real) return fixturePath(path);
    return protectedControlPath(path);
  };
  const manifestFile = resolveControl(manifestPath);
  const operation = root.probe_id;
  const run = resolveControl(root.cwd);
  const area = resolveControl(root.area_path);
  const approval = resolveControl(root.approval_path);
  requireTest(manifestFile === join(run,'MANIFEST.JSON') &&
    /^dye-live-[a-f0-9-]{36}$/.test(root.run_id) &&
    run === join(area,'RUNS','STAGE2-'+root.run_id.toUpperCase()) &&
    approval.startsWith(join(area,'APPROVALS')+'\\') &&
    root.ready === join(run,'LAUNCH-READY.JSON') &&
    root.steps_dir === join(run,'STEPS') &&
    root.lock_path === join(run,'GLOBAL.LOCK'), 'Fixture coordinator paths do not match the manifest');
  requireTest((real || root.run_class === runClass) && root.registry_hash === registryHash && Object.hasOwn(templates, operation) &&
    fileHash(fixture) === fixtureHash && fileHash(root.approval_path) === root.approval_hash, 'Fixture manifest mismatch');
  if (real) {
    requireTest(Object.hasOwn(INVENTORY_TEMPLATES, operation), 'Inventory approval cannot execute probes');
    const consent = readJson(root.approval_path).inventory;
    const role = INVENTORY_TEMPLATES[operation].role;
    bindInventoryApproval(consent, {
      templateId: operation, runId: root.run_id, runClass: root.run_class,
      bundleHash: inventoryTransportBundleHash(), providerContactAllowed: consent?.providerContactAllowed,
      tools: { [role]: { path: consent?.tools?.[role]?.path, sha256: fileHash(root.target_executable) } }
    });
    requireTest(pathTuple(consent.tools[role].path) === root.target_executable &&
      consent.tools[role].sha256 === root.target_hash, 'Protected target pin changed');
  }
  const ready = readJson(root.ready);
  takeLock(root.lock_path, {
    runId: root.run_id,
    node: { pid: ready.pid, createdAt: ready.created },
    launcher: { pid: ready.launcher, createdAt: ready.launcherCreated }
  }, inspector(root.cwd));
  // Fixed fake-only fault barriers: real inventory rejects these template IDs
  // before this point. No caller-supplied callback, path or command is accepted.
  const fixtureBarrier=async phase=>{
    requireTest(!real && root.run_class==='live-test','Fixture barrier requires test class');
    new Evidence(run).write('fixture-pause.json',{phase});
    const until=Date.now()+10000;
    while(!existsSync(join(run,'fixture-release'))){
      requireTest(Date.now()<until,'Fixture barrier timed out');
      await delay(10);
    }
  };
  if(operation==='before-acl')await fixtureBarrier('before-wrapper');
  if(operation==='attest-fault'){
    requireTest(!real && root.run_class==='live-test','Fixture fault requires test class');
    new Evidence(run).write('jobs/J1-attest.jsonl','fixture-exclusive-writer-fault\n',{raw:true});
  }
  const id = randomUUID();
  const path = join(root.steps_dir, id + '.request.json');
  const route = templates[operation].route;
  const stepMs = templates[operation].timeoutMs ?? 15000;
  const request = {
    schema: 1, type: 'request', mode, run_class: root.run_class, run_id: root.run_id, request_id: id,
    probe_id: operation, template_hash: templateHash(operation, real ? root.target_hash : fixtureHash, real), registry_hash: registryHash, manifest_hash: digest,
    cwd: root.cwd, executable: root.target_executable, executable_hash: root.target_hash, fixture, fixture_hash: fixtureHash,
    output_route: route, parent_pid: ready.pid, parent_created: ready.created, step_ms: stepMs,
    deadline_utc: Math.min(root.deadline_utc, Date.now() + stepMs), ready: path + '.ready.json', done: path + '.done.json',
    ...(route === 'memory-shape' ? { shape: path + '.shape.json' } : { stdout: join(root.cwd,'raw',operation+'.out'), stderr: join(root.cwd,'raw',operation+'.err') }),
    ...indexed('argv', real ? INVENTORY_TEMPLATES[operation].argv : [fixture, ...templateArgs(operation)])
  };
  if (operation === 'payload-identity') {
    const deployed = readJson(join(run, 'payload-before.json'));
    const expected = join(root.worktree, '.dye-stage2', 'payload-' + payloadHash.slice(0, 16) + '.mjs');
    requireTest(root.payload_hash === payloadHash && deployed.path.toUpperCase() === expected.toUpperCase() &&
      deployed.sha256 === payloadHash && /^[A-F0-9]{8}:[A-F0-9]{16}$/.test(deployed.id), 'Payload deployment binding');
    Object.assign(request, {
      payload_path: deployed.path, payload_id: deployed.id, payload_hash: payloadHash,
      ...indexed('argv', [deployed.path, 'identity', root.run_id.slice(9).replaceAll('-', '')])
    });
  }
  publishProbeRequest(path, request, mode);
  const deadline = request.deadline_utc + 5000;
  const reply = path + '.reply.json';
  let replyRecord;
  while (!replyRecord) {
    requireTest(Date.now() < deadline, 'Fixture wrapper reply timed out');
    if (existsSync(reply)) {
      try { replyRecord = readJson(reply); }
      catch (error) {
        if (error.code !== 'EBUSY' && !(error instanceof SyntaxError)) throw error;
      }
    }
    if (replyRecord) break;
    await delay(25);
  }
  const done = readJson(request.done);
  requireTest(replyRecord.wrapperExit === 0 && replyRecord.empty && done.empty && done.mode === mode &&
    done.run_class === root.run_class && done.attestationComplete === true, 'Fixture wrapper or cleanup failed');
  if(operation==='after-acl')await fixtureBarrier('after-wrapper');
  const shape = request.shape ? readJson(request.shape) : null;
  const shapeEvidence = shape ? validateAuthProjection(shape.projection) : null;
  const result = { mode, run_class: root.run_class, realResults: 'UNVERIFIED', stop: shape?.projection?.stop || 'READY', operation, inventoryRegistryHash,
    shape, shapeEvidence, done };
  if (operation === 'payload-identity') {
    result.payload = readJson(request.stdout);
    requireTest(done.exit === 0 && result.payload.op === 'identity' &&
      result.payload.nonce === root.run_id.slice(9).replaceAll('-', ''), 'Payload identity evidence mismatch');
  }
  if (real) result.inventoryProjection = buildStage2Result(result);
  new Evidence(root.cwd).write('result.json', result);
  return { state: result, exit: 0 };
}
