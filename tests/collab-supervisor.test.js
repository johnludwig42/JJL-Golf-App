import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, linkSync, unlinkSync, openSync, closeSync, ftruncateSync, renameSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { tmpdir } from 'node:os';
import { join, resolve, delimiter, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { hash, fault, launchSpec, childEnvironment, refuseReal, realEligibility } from '../scripts/collab-supervisor/lib/policy.js';
import { Evidence } from '../scripts/collab-supervisor/lib/evidence.js';
import { newBudget, remaining, account, stepBudget, recoverBudget } from '../scripts/collab-supervisor/lib/budget.js';
import { recordApproval, verifyApproval, records } from '../scripts/collab-supervisor/lib/approvals.js';
import { takeLock, recoverLock, lockState, readLock } from '../scripts/collab-supervisor/lib/lock.js';
import { authFixture } from '../scripts/collab-supervisor/lib/auth.js';
import { fakeAgent, parseAgentOutput } from '../scripts/collab-supervisor/lib/agents.js';
import { sweepMarked } from '../scripts/collab-supervisor/lib/processes.js';
import { runSession, STOPS, REFUSALS, EXIT, resumeState } from '../scripts/collab-supervisor/lib/state.js';
import { Git, regularTree } from '../scripts/collab-supervisor/lib/git.js';
import { fingerprint, treeSignature } from '../scripts/collab-supervisor/lib/fingerprint.js';
import { snapshot, verifySnapshot } from '../scripts/collab-supervisor/lib/snapshot.js';
import { checkSpec } from '../scripts/collab-supervisor/lib/checks.js';
import { main } from '../scripts/collab-supervisor/supervisor.js';

const start = performance.now();
const fixture = fileURLToPath(new URL('./fixtures/collab-supervisor/fake-agent.js', import.meta.url));
const fakeConfig = { mode: 'fake', node: process.execPath, fixture, fixtureRoot: dirname(fixture), fixtureHash: hash(readFileSync(fixture)) };
const expectation = { codexLine: 'Logged in using ChatGPT', versions: { codex: 'fixture-v1', claude: 'fixture-v1' }, claudeFields: { authMethod: 'claude.ai', loggedIn: true } };
const auth = () => ({ versions: expectation.versions, exit: 0, codexLine: expectation.codexLine, claudeJson: JSON.stringify(expectation.claudeFields) });
const implemented = { status: 'implemented', summary: 'fixture', criteria: [{ id: 'C1', result: 'PASS' }], disputes: [] };
const ready = { verdict: 'ready', findings: [] };
const finding = { id: 'R1', severity: 'medium', file: 'docs/fixture.md', line: 1, scenario: 'Fixture defect', criterion: 'C1' };
const temp = () => mkdtempSync(join(tmpdir(), 'dye-supervisor-test-'));
function setup(overrides = {}, changes = {}) {
  const root = temp(); let clock = 1000; let stopped = 0; let invocations = 0;
  const bytes = Buffer.from('approved fixture package');
  const config = { mode: 'fake', runId: 'fixture-run', packageId: 'WP-FAKE', baseSha: 'fixture-base', phase: 'A', bundle: 'fixture-bundle', totalMs: 10000, stepMs: 2000, criteria: ['C1'], requiredChecks: ['validate'], authExpectation: expectation, ...overrides };
  config.approval = { packageHash: hash(bytes), packageId: config.packageId, baseSha: config.baseSha, phase: config.phase, bundle: config.bundle };
  const io = {
    now: () => clock, packageBytes: () => bytes, approvedBytes: () => bytes,
    evidence: new Evidence(root), acquireLock: async () => {}, auth: async () => auth(), prepare: async () => {},
    identity: async () => 'fixture-identity', integrity: async () => {}, scope: async () => {}, capture: async round => `fingerprint-${round}`,
    signature: async () => 'fixture-tree', snapshot: async () => 'fixture-snapshot', verifySnapshot: async () => {},
    implement: async () => { invocations++; clock += 1; return structuredClone(implemented); },
    review: async () => { clock += 1; return structuredClone(ready); }, check: async () => ({ result: 'PASS' }),
    stopChildren: async () => { stopped++; }, ...changes
  };
  return { root, config, io, setClock: value => { clock = value; }, stopped: () => stopped, invocations: () => invocations };
}

test('state.ready — fake pipeline captures checks/evidence and stops without authority', async () => {
  const t = setup(); const result = await runSession(t.config, t.io);
  assert.equal(result.state.stop, 'READY'); assert.equal(result.exit, 0); assert.equal(t.stopped(), 1);
  assert.deepEqual(t.io.evidence.verify(), []); assert.match(readFileSync(join(t.root, 'report.md'), 'utf8'), /grants no commit/);
});
test('state.findings_correction_ready and state.two_corrections are bounded', async () => {
  const t = setup({}, { review: async state => state.round < 3 ? { verdict: 'findings', findings: [finding] } : ready });
  const result = await runSession(t.config, t.io); assert.equal(result.state.round, 3); assert.equal(result.state.stop, 'READY');
  const exhausted = setup({}, { review: async () => ({ verdict: 'findings', findings: [finding] }) });
  assert.equal((await runSession(exhausted.config, exhausted.io)).state.stop, 'ROUNDS_EXHAUSTED');
});
for (const code of [...STOPS, ...REFUSALS].filter(code => !['READY', 'EVIDENCE_WRITE', 'ROUNDS_EXHAUSTED'].includes(code))) {
  test(`state.each_stop_and_refusal — ${code}`, async () => {
    const t = setup({}, { prepare: async () => { throw fault(code); } });
    const result = await runSession(t.config, t.io); assert.equal(result.state.stop, code); assert.equal(result.exit, EXIT[code]);
    assert.ok(existsSync(join(t.root, 'state.json'))); assert.ok(existsSync(join(t.root, 'report.md')));
  });
}
test('state.failed_check_not_ready and missing criterion cannot be greenwashed by ready review', async () => {
  for (const changes of [{ check: async () => ({ result: 'NOT_RUN' }) }, { implement: async () => ({ ...implemented, criteria: [] }) }]) {
    const t = setup({}, changes); assert.equal((await runSession(t.config, t.io)).state.stop, 'ROUNDS_EXHAUSTED');
  }
});
test('integrity.head_ref_drift/reviewer_write/snapshot change and scope writes stop the pipeline', async () => {
  for (const [key, code] of [['integrity', 'INTEGRITY'], ['scope', 'SCOPE'], ['verifySnapshot', 'INTEGRITY']]) {
    const t = setup({}, { [key]: async () => { throw fault(code); } });
    assert.equal((await runSession(t.config, t.io)).state.stop, code);
  }
  let calls = 0; const t = setup({}, { signature: async () => ++calls === 1 ? 'old' : 'changed' });
  assert.equal((await runSession(t.config, t.io)).state.stop, 'INTEGRITY');
});
test('policy.argv_refusals/npm_refused and phaseA.no_real_cli_dispatch', () => {
  for (const kind of ['npm', 'codex', 'claude', 'version', 'auth', 'shell']) assert.throws(() => launchSpec(kind, fakeConfig, 'ready'), { code: 'NOT_APPROVED' });
  assert.throws(() => launchSpec('fake-agent', { ...fakeConfig, node: fixture }, 'ready'), { code: 'NOT_PLATFORM_ACCEPTED' });
  assert.throws(() => launchSpec('fake-agent', { ...fakeConfig, fixtureHash: 'bad' }, 'ready'), { code: 'INTEGRITY' });
  for (const args of [['run'], ['approve'], ['resume'], ['recover'], ['run', '--disable-launcher'], ['platform-probes']]) assert.throws(() => main(args), { code: 'NOT_PLATFORM_ACCEPTED' });
  assert.throws(refuseReal, { code: 'NOT_PLATFORM_ACCEPTED' });
});
test('phaseA.forged_platform_record_still_refused; eligibility checks record, bundle, versions and all rows', () => {
  const record = { phase: 'C', approval: { phase: 'C', bundle: 'bundle' }, bundle: 'bundle', versions: ['v'], platform: { bundle: 'bundle', versions: ['v'], reviewed: true, required: [{ result: 'PASS' }] } };
  assert.equal(realEligibility(record), true); assert.throws(refuseReal, { code: 'NOT_PLATFORM_ACCEPTED' });
  assert.throws(() => realEligibility({ ...record, platform: { ...record.platform, required: [{ result: 'NOT_RUN' }] } }), { code: 'NOT_PLATFORM_ACCEPTED' });
  assert.throws(() => realEligibility({ ...record, approval: null }), { code: 'NOT_APPROVED' });
});
test('environment.allowlist_only strips provider, Node and npm settings without logging values', () => {
  const parent = { SystemRoot: 'system', ANTHROPIC_API_KEY: 'private', CODEX_API_KEY: 'private', SUPABASE_URL: 'private', NODE_OPTIONS: 'private', npm_config_script_shell: 'private', PATH: 'private', HOME: 'private' };
  const env = childEnvironment(parent, 'scratch', 'marker', ['runtime']);
  assert.deepEqual(Object.keys(env).sort(), ['DYE_SUPERVISOR_CHILD', 'PATH', 'SystemRoot', 'TEMP', 'TMP'].sort());
  assert.ok(!JSON.stringify(env).includes('private'));
});
test('agents fake subprocess integration: implemented, malformed, usage and timeout; audited executable is Node only', async () => {
  const audit = []; const options = { audit: spec => audit.push(spec), env: childEnvironment(process.env, tmpdir(), 'fake', [dirname(process.execPath)]), timeoutMs: 2000 };
  assert.equal((await fakeAgent(fakeConfig, 'implemented', options)).status, 'implemented');
  await assert.rejects(fakeAgent(fakeConfig, 'garbage', options), { code: 'AGENT_ERROR' });
  await assert.rejects(fakeAgent(fakeConfig, 'usage', options), { code: 'AUTH_OR_USAGE' });
  await assert.rejects(fakeAgent(fakeConfig, 'hang', { ...options, timeoutMs: 300 }), { code: 'TIMEOUT' });
  assert.ok(audit.every(row => row.executable === process.execPath && row.args[0] === fixture && row.shell === false));
});
test('approvals.non_tty/child_marker/broken_chain/package drift at each step', async () => {
  const root = temp(), path = join(root, 'approvals.jsonl'); const bytes = Buffer.from('package');
  const row = { packageId: 'WP-X', phase: 'A', baseSha: 'base', bundle: 'bundle', packageHash: hash(bytes) };
  for (const guard of [{ tty: false }, { tty: true, marker: true }, { tty: true, ancestry: ['codex'] }]) assert.throws(() => recordApproval(path, row, guard), { code: 'NOT_APPROVED' });
  const approved = recordApproval(path, row, { tty: true, enteredId: 'WP-X', enteredPhase: 'A' });
  assert.equal(verifyApproval(approved, bytes, bytes, row), true);
  assert.throws(() => verifyApproval(approved, Buffer.from('drift'), bytes, row), { code: 'NOT_APPROVED' });
  writeFileSync(path, readFileSync(path, 'utf8').replace('"sequence":1', '"sequence":2'));
  assert.throws(() => records(path), { code: 'INTEGRITY' });
  let reads = 0; const t = setup({}, { packageBytes: () => Buffer.from(++reads < 3 ? 'approved fixture package' : 'drift') });
  assert.equal((await runSession(t.config, t.io)).state.stop, 'NOT_APPROVED');
});
test('resume.fixed_deadline/spent_step_budget/clock_anomalies and owner choice on interrupted agents', () => {
  const budget = newBudget(1000, 1000); account(budget, 1100, 100); budget.steps.review = 70;
  assert.equal(stepBudget(budget, 'review', 100, 1100), 30);
  assert.equal(remaining(budget, 1900), 100);
  assert.throws(() => recoverBudget(budget, 2100), { code: 'TIMEOUT' });
  account(budget, 900, 1); assert.ok(budget.anomalies.includes('CLOCK_BACKWARDS'));
  const t = setup(); const state = { budget: newBudget(1000, 100000), currentStep: 'IMPLEMENT-1' };
  const options = { now: 1001, source: t.io.packageBytes(), approved: t.io.approvedBytes(), record: t.config.approval, identity: t.config, signature: 'a', expectedSignature: 'a' };
  assert.throws(() => resumeState(state, options), { code: 'OWNER_APPROVAL' });
  assert.equal(resumeState(state, { ...options, ownerRetry: true }).reconstructed, true);
  assert.throws(() => resumeState(state, { ...options, signature: 'b' }), { code: 'INTEGRITY' });
});
test('resume.crash_at_each_step preserves last durable checkpoint and cannot reset original budget', async () => {
  for (const point of ['prepare', 'implement', 'capture', 'check', 'review', 'verifySnapshot']) {
    const t = setup({}, { [point]: async () => { throw fault('AGENT_ERROR', 'Simulated hard interruption boundary'); } });
    const result = await runSession(t.config, t.io); const saved = JSON.parse(readFileSync(join(t.root, 'state.json'), 'utf8'));
    assert.equal(saved.budget.originalDeadlineUtc, 11000); assert.equal(result.state.stop, 'AGENT_ERROR');
    assert.throws(() => recoverBudget(saved.budget, 11001, true), { code: 'TIMEOUT' });
  }
});
test('evidence.failure_each_artifact / short storage failures stop work and report partial evidence honestly', async () => {
  for (const artifact of ['state.json', 'events.jsonl', 'evidence-index.jsonl', 'report.md']) {
    const t = setup();
    t.io.evidence = new Evidence(t.root, { inject: (_, path) => { if (path.includes(artifact)) throw Object.assign(new Error('fixture disk full'), { code: 'ENOSPC' }); } });
    const result = await runSession(t.config, t.io); assert.equal(result.state.stop, 'EVIDENCE_WRITE');
    assert.ok(result.state.evidenceIncomplete.length); assert.equal(t.stopped(), 1);
  }
  const e = new Evidence(temp()); e.write('r1.diff', 'bytes', { raw: true });
  assert.throws(() => e.write('r1.diff', 'replacement', { raw: true }), { code: 'EVIDENCE_WRITE' });
  writeFileSync(e.path('r1.diff'), 'tampered'); assert.deepEqual(e.verify(), ['r1.diff']);
});
test('evidence.rename failure never deletes prior checkpoint; mutable index tracks latest state', () => {
  let fail = false; const e = new Evidence(temp(), { inject: (action) => { if (fail && action === 'rename') throw new Error('rename denied'); } });
  e.write('state.json', { n: 1 }, { mutable: true }); e.write('state.json', { n: 2 }, { mutable: true });
  assert.deepEqual(e.verify(), []); fail = true;
  assert.throws(() => e.write('state.json', { n: 3 }, { mutable: true }), { code: 'EVIDENCE_WRITE' });
  assert.equal(JSON.parse(readFileSync(e.path('state.json'))).n, 2);
});

async function heldCheckpoint(path, holdMs) {
  const root = dirname(path), request = join(root, 'reader-request.json'), ready = join(root, 'reader-ready');
  writeFileSync(request, JSON.stringify({ target: path, ready, holdMs }));
  const helper = fileURLToPath(new URL('./fixtures/collab-supervisor/hold-checkpoint.ps1', import.meta.url));
  const ps = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const child = spawn(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper, '-Request', request], {windowsHide:true,stdio:['ignore','ignore','pipe']});
  let errors = ''; child.stderr.on('data', bytes => { errors += bytes; });
  const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(errors))); });
  const until = Date.now() + 5000;
  while (!existsSync(ready)) {
    if (child.exitCode !== null || Date.now() >= until) { child.kill(); await done; throw new Error('Reader did not acquire checkpoint'); }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return { done };
}

test('evidence.short Windows checkpoint reader permits retry and the run reaches READY', {skip:process.platform !== 'win32'}, async () => {
  const t = setup(); let reader;
  t.io.prepare = async () => { reader = await heldCheckpoint(join(t.root, 'state.json'), 350); };
  try {
    const result = await runSession(t.config,t.io); assert.equal(result.state.stop,'READY');
    assert.deepEqual(result.state.evidenceIncomplete,[]); assert.deepEqual(t.io.evidence.verify(),[]);
  } finally { await reader?.done; }
});

test('evidence.long Windows checkpoint reader stops with EVIDENCE_WRITE, keeps checkpoint and deduplicates failures', {skip:process.platform !== 'win32'}, async () => {
  const t = setup(); let reader, previous;
  t.io.prepare = async () => {
    previous=readFileSync(join(t.root,'state.json')); reader=await heldCheckpoint(join(t.root,'state.json'),2500);
  };
  try {
    const result=await runSession(t.config,t.io); assert.equal(result.state.stop,'EVIDENCE_WRITE');
    assert.equal(t.stopped(),1); assert.ok(previous); assert.ok(existsSync(join(t.root,'state.json')));
    assert.equal(result.state.evidenceIncomplete.length,1);
    assert.match(result.state.evidenceIncomplete[0],/state.json: rename failed/);
    assert.equal(JSON.parse(readFileSync(join(t.root,'state.json'))).stop,'EVIDENCE_WRITE');
  } finally { await reader?.done; }
});
test('lock.two_run_folders/live/stale/PID reuse/uncertain identity and interactive recovery', () => {
  const root = temp(), path = join(root, 'global.lock');
  const folderA=join(root,'run-a'),folderB=join(root,'run-b');mkdirSync(folderA);mkdirSync(folderB);
  const row = { runFolder:folderA,node: { pid: 1, createdAt: '134000000000000001' }, launcher: { pid: 2, createdAt: '134000000000000002' } };
  const dead = () => ({ alive: false }); takeLock(path, row, dead);
  assert.throws(() => takeLock(path, {...row,runFolder:folderB}, dead), { code: 'LOCK_STALE' });
  assert.equal(lockState(row, () => ({ alive: true, createdAt: '134000000000000003' })), 'LOCK_STALE');
  assert.equal(lockState(row, pid => ({ alive: true, createdAt: row[pid === 1 ? 'node' : 'launcher'].createdAt })), 'LOCK_HELD');
  assert.equal(lockState(row, pid => ({ alive: true, createdAt: pid === 1 ? '134000000000000003' : row.launcher.createdAt })), 'LOCK_HELD');
  for (const malformed of [134000000000000003, '0134000000000000003', '134000000000000003.0', '1.34e17', 'unknown', '9223372036854775808']) {
    assert.throws(() => lockState(row, () => ({ alive: true, createdAt: malformed })), { code: 'LOCK_INSPECTION_FAILED' });
  }
  assert.throws(() => lockState({...row,node:{...row.node,createdAt:'different-format'}}, () => ({ alive: true, createdAt: '134000000000000003' })), { code: 'LOCK_INSPECTION_FAILED' });
  assert.throws(()=>lockState(row,()=>({unknown:true,reason:'denied'})),{code:'LOCK_INSPECTION_FAILED'});
  assert.throws(() => recoverLock(path, join(root, 'archive'), { tty: false }), { code: 'NOT_APPROVED' });
  assert.throws(() => recoverLock(path, join(root, 'archive'), { tty: true, inspect: dead, survivors: () => [123] }), { code: 'ISOLATION' });
  recoverLock(path, join(root, 'archive'), { tty: true, inspect: dead, survivors: () => [] }); assert.ok(existsSync(join(root, 'archive')));
});

test('R4 auth uses configured fields without a guessed real field name',()=>{
  const configured={...expectation,claudeFields:{source:'synthetic-subscription',authenticated:true}};
  assert.equal(authFixture(configured,{...auth(),claudeJson:JSON.stringify(configured.claudeFields)}),true);
  assert.throws(()=>authFixture(null,auth()),{code:'AUTH_OR_USAGE'});
});
test('R1 absolute deadlines include startup and remaining check budget',async()=>{
  const t=setup({totalMs:1000,stepMs:2000},{monotonic:()=>0});
  t.io.implement=async(_state,timeout,deadline)=>{assert.equal(timeout,1000);assert.equal(deadline,2000);t.setClock(1100);return implemented;};
  t.io.check=async(_name,timeout,deadline)=>{assert.equal(timeout,900);assert.equal(deadline,2000);return{result:'PASS'};};
  assert.equal((await runSession(t.config,t.io)).state.stop,'READY');
});
test('R5 valid review words are data; stderr and structured limits remain stops',()=>{
  const review={verdict:'findings',findings:[{...finding,scenario:'sign-in recovery, usage chart and rate limit copy'}]};
  assert.deepEqual(parseAgentOutput(JSON.stringify(review)),review);
  assert.throws(()=>parseAgentOutput(JSON.stringify(review),'usage limit reached'),{code:'AUTH_OR_USAGE'});
  assert.throws(()=>parseAgentOutput('usage limit reached'),{code:'AUTH_OR_USAGE'});
  assert.throws(()=>parseAgentOutput(JSON.stringify({error:{code:'USAGE_LIMIT'}})),{code:'AUTH_OR_USAGE'});
});
test('R6 atomic lock cannot publish an empty file; damaged recovery needs consent and sweep',()=>{
  const root=temp(),path=join(root,'global.lock'),row={node:{pid:1,createdAt:'x'},launcher:{pid:2,createdAt:'x'}};
  assert.throws(()=>takeLock(path,row,()=>({alive:false}),{beforePublish:()=>{throw new Error('crash before atomic publish');}}),/crash/);
  assert.equal(existsSync(path),false);
  writeFileSync(path,'');assert.throws(()=>readLock(path),{code:'LOCK_DAMAGED'});
  assert.throws(()=>takeLock(path,row,()=>({alive:false})),{code:'LOCK_DAMAGED'});
  assert.throws(()=>recoverLock(path,join(root,'old.lock'),{tty:true,survivors:()=>[]}),{code:'LOCK_DAMAGED'});
  assert.throws(()=>recoverLock(path,join(root,'old.lock'),{tty:true,damagedConfirmed:true,survivors:()=>[123]}),{code:'ISOLATION'});
  recoverLock(path,join(root,'old.lock'),{tty:true,damagedConfirmed:true,survivors:()=>[]});assert.equal(readFileSync(join(root,'old.lock'),'utf8'),'');
});
test('R1 sweep separates denial, detected escapes, PID reuse and verified termination',()=>{
  const config={marker:'fixture-marker',fixture:'fixture.js',startedAt:100};
  let killed=0;const row={...config,pid:1,createdAt:'old'};
  const base={...config,enumerate:()=>({result:'PASS',processes:[row]}),inspect:()=>({alive:true,createdAt:'old'}),terminate:()=>{killed++;return true;}};
  assert.equal(sweepMarked({...base,enumerate:()=>({result:'NOT_RUN',reason:'denied'})}).result,'NOT_RUN');assert.equal(killed,0);
  assert.equal(sweepMarked({...base,inspect:()=>({alive:true,createdAt:'new'})}).result,'FAIL');assert.equal(killed,0);
  assert.equal(sweepMarked({...base,isMember:()=>true}).escapes.length,0);
  const result=sweepMarked(base);assert.equal(result.result,'PASS');assert.equal(result.escapes[0].detectedEscape,true);assert.equal(killed,1);
});
test('auth exact fixture/version pin and every invalid outcome fail without model calls', async () => {
  assert.equal(authFixture(expectation, auth()), true);
  assert.throws(() => authFixture(null, auth()), { code: 'AUTH_OR_USAGE' });
  for (const bad of [{ ...auth(), versions: {} }, { ...auth(), exit: 1 }, { ...auth(), timeout: true }, { ...auth(), claudeJson: '{}' }, { ...auth(), claudeJson: 'garbage' }, { ...auth(), claudeJson: JSON.stringify({ ...expectation.claudeFields, apiKey: true }) }, { ...auth(), codexLine: 'API key' }]) {
    const t = setup({}, { auth: async () => bad }); const result = await runSession(t.config, t.io);
    assert.ok(['AUTH_OR_USAGE', 'AGENT_VERSION'].includes(result.state.stop)); assert.equal(t.invocations(), 0);
  }
});

function gitBinary() {
  for (const entry of (process.env.PATH || '').split(delimiter)) {
    const path = join(entry, process.platform === 'win32' ? 'git.exe' : 'git'); if (existsSync(path)) return path;
  }
  throw new Error('C4 real Git test prerequisite missing');
}
function repo() {
  const root = temp(); assert.ok(resolve(root).startsWith(resolve(tmpdir())));
  const executable = gitBinary();
  // Test bootstrap must not inherit the operator's hooks, templates, signing or
  // injected Git configuration before the production hardener is constructed.
  const env = { SystemRoot: process.env.SystemRoot || '', PATH: dirname(executable), PATHEXT: '.EXE;.COM', TEMP: tmpdir(), TMP: tmpdir(),
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_ATTR_NOSYSTEM: '1', GIT_CONFIG_COUNT: '0', GIT_TERMINAL_PROMPT: '0' };
  const raw = args => execFileSync(executable, ['-c', 'user.name=Supervisor Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false', ...args], { cwd: root, env, encoding: 'utf8', windowsHide: true });
  raw(['init']); writeFileSync(join(root, 'data.txt'), 'fixture'); raw(['add', '.']); raw(['commit', '-m', 'Disposable test fixture']);
  const emptyConfig = join(root, 'empty-config'), emptyHooks = join(root, 'empty-hooks'); writeFileSync(emptyConfig, ''); mkdirSync(emptyHooks);
  const git = new Git({ executable, root, gitDir: join(root, '.git'), emptyConfig, emptyHooks });
  return { root, raw, git, executable, emptyConfig, emptyHooks, env };
}
test('C4 real Git: planted fsmonitor runs in positive control, hardening blocks it; real ref movement detected', () => {
  const r = repo(), marker = join(r.root, 'hook-marker').replaceAll('\\', '/'), hook = join(r.root, 'fsmonitor-hook');
  writeFileSync(hook, `#!/bin/sh\nprintf called > '${marker}'\nprintf '\\0'\n`, { mode: 0o755 });
  r.raw(['config', 'core.fsmonitor', hook.replaceAll('\\', '/')]);
  r.raw(['status', '--porcelain']); assert.ok(existsSync(marker), 'positive control must really execute the planted fsmonitor'); unlinkSync(marker);
  r.git.run(['status', '--porcelain']); assert.equal(existsSync(marker), false);
  const identity = r.git.identity(); r.raw(['-c', 'core.fsmonitor=false', 'commit', '--allow-empty', '-m', 'Disposable ref move']);
  assert.throws(() => r.git.assertIdentity(identity), { code: 'INTEGRITY' });
  assert.throws(() => r.git.run(['commit', '-m', 'never']), { code: 'NOT_APPROVED' });
  assert.throws(() => r.git.run(['diff', '--ext-diff']), { code: 'NOT_APPROVED' });
  assert.throws(() => r.git.run(['show', '--textconv', 'HEAD:data.txt']), { code: 'NOT_APPROVED' });
});
test('C4 real Git: redirected worktree pointer is refused before any git command', () => {
  const r = repo(); const wt = join(r.root, 'wt'); r.raw(['worktree', 'add', '-b', 'fixture-branch', wt]);
  const gitDir = r.raw(['-C', wt, 'rev-parse', '--absolute-git-dir']).trim();
  const git = new Git({ executable: r.executable, root: wt, gitDir, emptyConfig: r.emptyConfig, emptyHooks: r.emptyHooks, pointer: join(wt, '.git') });
  assert.ok(git.identity().head);
  // Git marks this fixture file hidden on Windows; r+ preserves its attributes.
  const pointerFd = openSync(join(wt, '.git'), 'r+');
  try { ftruncateSync(pointerFd, 0); writeFileSync(pointerFd, `gitdir: ${join(r.root, 'different-metadata')}\n`); } finally { closeSync(pointerFd); }
  assert.throws(() => git.status(), { code: 'INTEGRITY' });
});
test('integrity links refused; snapshots detect added/changed files; check closure drift is NOT_RUN', () => {
  const r = repo(); const base = r.git.identity().head;
  writeFileSync(join(r.root, '.gitignore'), 'empty-*\n'); r.raw(['add', '.gitignore']); r.raw(['commit', '-m', 'Fixture ignores']);
  const dest = temp(), hashes = snapshot(r.git, dest); verifySnapshot(dest, hashes);
  writeFileSync(join(dest, 'data.txt'), 'changed'); assert.throws(() => verifySnapshot(dest, hashes), { code: 'INTEGRITY' });
  linkSync(join(r.root, 'data.txt'), join(r.root, 'hardlink.txt'));
  assert.throws(() => r.git.hygiene(), { code: 'INTEGRITY' });
  assert.throws(() => regularTree(r.root), { code: 'INTEGRITY' });
  assert.throws(() => checkSpec('npm test', r.git, base, process.execPath), { code: 'NOT_APPROVED' });
});

test('integrity.actual out-of-scope file is preserved and rejected by hardened Git', () => {
  const r = repo();
  r.git.assertScope(['data.txt', 'empty-config', 'empty-hooks/']);
  writeFileSync(join(r.root, 'outside.md'), 'preserve this evidence');
  assert.throws(() => r.git.assertScope(['data.txt', 'empty-config', 'empty-hooks/']), { code: 'SCOPE' });
  assert.equal(readFileSync(join(r.root, 'outside.md'), 'utf8'), 'preserve this evidence');
});
test('fingerprint.manual_byte_parity and retained untracked hashes (real Git; no project commits)', () => {
  const r = repo(), base = r.git.identity().head;
  writeFileSync(join(r.root, 'data.txt'), 'changed'); writeFileSync(join(r.root, 'new.md'), 'new');
  const directory = temp(); const result = fingerprint(r.git, { base, packageId: 'WP-FAKE', round: 1, directory });
  assert.equal(result.diffHash, hash(readFileSync(result.diff)));
  const independent = join(directory, 'manual.diff'); r.raw(['diff', '--binary', base, `--output=${independent}`]);
  assert.deepEqual(readFileSync(result.diff), readFileSync(independent));
  assert.ok(result.untracked.includes(`${hash(Buffer.from('new'))}  new.md`));
  assert.throws(() => fingerprint(r.git, { base, packageId: 'WP-FAKE', round: 1, directory }), { code: 'INTEGRITY' });
  const signature = treeSignature(r.git, base); writeFileSync(join(r.root, 'new.md'), 'newer'); assert.notEqual(treeSignature(r.git, base), signature);
});

test('fingerprint.PowerShell51 documented procedure matches manifest and diff bytes', { skip: process.platform !== 'win32' }, () => {
  const r = repo(), base = r.git.identity().head, evidence = temp();
  writeFileSync(join(r.root, 'data.txt'), 'changed'); writeFileSync(join(r.root, 'new.md'), 'new');
  writeFileSync(join(r.root, 'Zulu.md'), 'case ordering'); writeFileSync(join(r.root, 'alpha.md'), 'case ordering');
  const doc = readFileSync(new URL('../docs/07_CLAUDE_CODEX_HANDOFF.md', import.meta.url), 'utf8');
  const script = doc.split('```powershell\n')[1]?.split('```')[0] || doc.split('```powershell\r\n')[1]?.split('```')[0];
  assert.ok(script, 'manual procedure is present');
  const scriptPath = join(temp(), 'manual.ps1');
  const module = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'Modules', 'Microsoft.PowerShell.Utility', 'Microsoft.PowerShell.Utility.psd1');
  writeFileSync(scriptPath, `Import-Module '${module}' -ErrorAction Stop\n` + script.replace("$workPackage = 'WP-DOC-01'", "$workPackage = 'WP-FAKE'")
    .replace("$base = '<full starting SHA>'", `$base = '${base}'`)
    .replace("$evidenceRoot = ''", `$evidenceRoot = '${evidence.replaceAll("'", "''")}'`));
  const ps = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  execFileSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { cwd: r.root, env: r.env, windowsHide: true });
  const directory = join(evidence, 'WP-FAKE');
  const manualDiff = join(directory, 'manual.diff'), manualManifest = join(directory, 'manual-manifest.txt');
  renameSync(join(directory, 'r1.diff'), manualDiff); renameSync(join(directory, 'r1-manifest.txt'), manualManifest);
  const result = fingerprint(r.git, { base, packageId: 'WP-FAKE', round: 1, directory });
  assert.deepEqual(readFileSync(result.diff), readFileSync(manualDiff));
  assert.deepEqual(readFileSync(result.manifest), readFileSync(manualManifest));
});

test('policy.execution_closure_drift prevents executing a modified check', () => {
  const r = repo(); mkdirSync(join(r.root, 'scripts'));
  writeFileSync(join(r.root, 'scripts', 'validate-release.js'), 'fixture only\n');
  writeFileSync(join(r.root, 'package.json'), '{}\n');
  r.raw(['add', 'scripts/validate-release.js', 'package.json']); r.raw(['commit', '-m', 'Disposable closure baseline']);
  const base = r.git.identity().head;
  assert.equal(checkSpec('validate', r.git, base, process.execPath).result, 'ELIGIBLE');
  writeFileSync(join(r.root, 'scripts', 'validate-release.js'), 'untrusted modification\n');
  assert.equal(checkSpec('validate', r.git, base, process.execPath).result, 'NOT_RUN');
});

test('evidence.read_only_missing_enospc failures and cleanup exceptions remain visible', async () => {
  for (const code of ['EACCES', 'ENOENT', 'ENOSPC']) {
    const e = new Evidence(temp(), { inject: () => { throw Object.assign(new Error('injected storage fault'), { code }); } });
    assert.throws(() => e.write('fixture.json', {}), { code: 'EVIDENCE_WRITE' });
  }
  const t = setup({}, { stopChildren: async () => { throw new Error('injected cleanup failure'); } });
  const result = await runSession(t.config, t.io);
  assert.equal(result.state.stop, 'ISOLATION'); assert.match(readFileSync(join(t.root, 'report.md'), 'utf8'), /cleanup unverified/);
});

test('budget.heartbeat persists ten-second in-flight accounting before an agent completes', async () => {
  const t = setup({ totalMs: 30000, stepMs: 20000 }, { now: () => Date.now() });
  t.io.implement = async () => {
    await new Promise(resolve => setTimeout(resolve, 10200));
    const saved = JSON.parse(readFileSync(join(t.root, 'state.json'), 'utf8'));
    assert.equal(saved.currentStep, 'IMPLEMENT-1');
    assert.ok(saved.budget.consumedMs >= 9900);
    assert.ok(saved.budget.steps['IMPLEMENT-1'] >= 9900);
    return implemented;
  };
  assert.equal((await runSession(t.config, t.io)).state.stop, 'READY');
});

test('budget.monotonic consumption survives a backwards wall clock; resume refuses ambiguity', async () => {
  let tick = 0;
  const t = setup({}, { monotonic: () => tick });
  t.io.implement = async () => { tick = 500; t.setClock(900); return implemented; };
  const result = await runSession(t.config, t.io);
  assert.ok(result.state.budget.consumedMs >= 500);
  assert.ok(result.state.budget.anomalies.includes('CLOCK_BACKWARDS'));
  assert.throws(() => recoverBudget(newBudget(1000, 10000), 900, true), { code: 'OWNER_APPROVAL' });
});

test('resume.actual hard kill at six fake coordinator boundaries preserves the last checkpoint', async () => {
  const crashFixture = fileURLToPath(new URL('./fixtures/collab-supervisor/fake-crash-session.js', import.meta.url));
  for (const point of ['prepare', 'implement', 'capture', 'check', 'review', 'verifySnapshot']) {
    const directory = temp();
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [crashFixture, directory, point], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let ready = false, errors = '';
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Fake crash fixture did not reach ${point}`)); }, 3000);
      child.stdout.on('data', bytes => { if (String(bytes).includes('FAKE_BOUNDARY_READY')) { ready = true; child.kill('SIGKILL'); } });
      child.stderr.on('data', bytes => { errors += bytes; });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', (_, signal) => { clearTimeout(timer); if (ready && signal === 'SIGKILL') resolve(); else reject(new Error(errors || 'Fake boundary was not hard-killed')); });
    });
    const saved = JSON.parse(readFileSync(join(directory, 'state.json'), 'utf8'));
    assert.equal(saved.budget.originalDeadlineUtc, 31000);
    assert.equal(existsSync(join(directory, 'report.md')), false, 'hard kill cannot claim an original final report');
    assert.deepEqual(new Evidence(directory).verify(), []);
    assert.equal(recoverBudget(saved.budget, 1001, true).originalDeadlineUtc, 31000);
    assert.throws(() => recoverBudget(saved.budget, 31001, true), { code: 'TIMEOUT' });
  }
});
test('suite elapsed time is measured, never used to remove coverage', () => {
  console.log(`Supervisor fake-only suite measured elapsed: ${(performance.now() - start).toFixed(1)} ms (target <30000 ms)`);
});
