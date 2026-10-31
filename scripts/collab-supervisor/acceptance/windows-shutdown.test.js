import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { hash } from '../lib/policy.js';
import { operatorSkipReason,runOperatorCase } from './operator-cases.js';

// Manual fake-process suite only. Never discovers or invokes either real agent.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixture = fileURLToPath(new URL('../../../tests/fixtures/collab-supervisor/fake-process-tree.js', import.meta.url));
const probe = fileURLToPath(new URL('../../../tests/fixtures/collab-supervisor/fake-job-probe.ps1', import.meta.url));
const powershell = process.platform === 'win32' ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : '';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const read = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const write = (path, data) => writeFileSync(path, JSON.stringify(data), { flag: 'wx' });
async function until(predicate, ms = 9000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (predicate()) return; await delay(30); }
  throw new Error('Timed out observing fake test process');
}
function creation(pid) {
  assert.ok(Number.isInteger(pid) && pid > 0);
  try { return execFileSync(powershell, ['-NoProfile', '-Command', `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToFileTimeUtc().ToString()`], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { return null; }
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
function killOwned(row) {
  if (!row || !alive(row.pid)) return;
  const actual = creation(row.pid);
  if (!actual || actual !== row.created) throw new Error('Cannot verify test-created PID; refusing kill');
  process.kill(row.pid, 'SIGKILL');
}
const cases = ['step_timeout', 'hard_kill_node', 'hard_kill_launcher', 'hard_kill_wrapper',
  'hard_kill_node_and_launcher', 'detached_grandchild', 'wrapper_parent_death_only', 'launcher_j0_only',
  'launcher_total_deadline', 'wrapper_step_deadline_only', 'child_cannot_inherit_job_handles', 'refused_breakaway', 'agent_membership_both_jobs'];

for (const scenario of cases) test(`windows.shutdown.${scenario}`, { skip: process.platform !== 'win32' ? 'NOT_RUN: Windows-only fake process test' : false }, async t => {
  const scratch = mkdtempSync(join(tmpdir(), 'dye-shutdown-fake-')); const marker = randomUUID();
  const paths = Object.fromEntries(['launcherSpec', 'driver', 'worker', 'grandchild', 'wrapperSpec', 'launcherReady', 'launcherDone', 'wrapperReady', 'wrapperDone', 'driverReady', 'workerReady', 'grandchildReady', 'wrapperPid', 'grandchildPid', 'handles', 'wrapperError'].map(name => [name, join(scratch, name + '.json')]));
  const owned = []; let launcher; let stderr = '';
  const childContext = { kind: 'fake', executable: process.execPath, fixture, fixtureHash: hash(readFileSync(fixture)), cwd: scratch };
  const wrapperOnly = scenario === 'wrapper_parent_death_only' || scenario === 'wrapper_step_deadline_only';
  const totalOnly = scenario === 'launcher_total_deadline';
  write(paths.grandchild, { marker, ownReady: paths.grandchildReady });
  write(paths.worker, { marker, ownReady: paths.workerReady, child: paths.grandchild, fixture, childPid: paths.grandchildPid, detached: scenario === 'detached_grandchild' });
  // Node never spawns the wrapper. The launcher creates a native sibling in J0,
  // outside this driver's libuv job, so killing Node cannot mask either layer.
  write(paths.driver, { marker, ownReady: paths.driverReady });
  write(paths.launcherSpec, { ...childContext, args: [fixture, paths.driver], stdout: join(scratch, 'node.stdout'), stderr: join(scratch, 'node.stderr'), ready: paths.launcherReady, done: paths.launcherDone,
    brokerSpec:paths.wrapperSpec,totalMs: totalOnly ? 7000 : 14000, graceMs: 100, disableLauncherExitWatch: wrapperOnly, wrapperDone: paths.wrapperDone });
  try {
    launcher = spawn(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'launch.ps1'), '-SpecPath', paths.launcherSpec, '-TestHarness'], { env: { ...process.env, DYE_SUPERVISOR_TEST: '1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    launcher.stderr.on('data', bytes => { stderr += bytes; });
    const launcherCreated = creation(launcher.pid);
    if (!launcherCreated) { t.skip('NOT_RUN: sandbox cannot observe test launcher creation time'); return; }
    owned.push({ pid: launcher.pid, created: launcherCreated });
    await until(() => existsSync(paths.launcherReady) || launcher.exitCode !== null);
    if (!existsSync(paths.launcherReady)) {
      if (/denied|privilege|not supported|Assign child before resume|Access/i.test(stderr)) { t.skip(`NOT_RUN: sandbox Job Object setup/containment unavailable: ${stderr.trim()}`); return; }
      throw new Error(stderr || 'Launcher failed before readiness');
    }
    const parent = read(paths.launcherReady); owned.push({ pid: parent.pid, created: String(parent.created) });
    const breakawayCase = scenario === 'refused_breakaway';
    const handleCase = scenario === 'child_cannot_inherit_job_handles' || breakawayCase;
    write(paths.wrapperSpec, { ...childContext,
      executable: handleCase ? powershell : process.execPath,
      fixture: handleCase ? probe : fixture, fixtureHash: hash(readFileSync(handleCase ? probe : fixture)),
      args: handleCase ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probe, '-Library', join(root, 'lib', 'windows-job.ps1'), '-J0', String(parent.job), '-J1', '__DYE_JOB_HANDLE__', '-Output', paths.handles,
        ...(breakawayCase ? ['-Breakaway', '-Node', process.execPath, '-Fixture', fixture, '-Spec', paths.grandchild, '-Scratch', scratch] : [])] : [fixture, paths.worker],
      stdout: join(scratch, 'worker.stdout'), stderr: join(scratch, 'worker.stderr'), ready: paths.wrapperReady, done: paths.wrapperDone,
      wrapperPid:paths.wrapperPid,parentPid: parent.pid, parentCreated: String(parent.created), disableParentWatch: scenario === 'launcher_j0_only',
      stepMs: scenario === 'step_timeout' || scenario === 'wrapper_step_deadline_only' ? 3500 : 25000 });
    await until(() => existsSync(paths.wrapperReady));
    const worker = read(paths.wrapperReady); owned.push({ pid: worker.pid, created: String(worker.created) });
    if (existsSync(paths.wrapperPid)) {
      const pid = Number(readFileSync(paths.wrapperPid, 'utf8')); const created = creation(pid);
      if (created) owned.push({ pid, created });
    }
    if (handleCase) {
      await until(() => existsSync(paths.handles));
      if (read(paths.handles).result === 'NOT_RUN') { t.skip(`NOT_RUN: handle inspection unavailable: ${read(paths.handles).reason}`); return; }
      if (breakawayCase) assert.equal(read(paths.handles).result, 'refused');
      else assert.deepEqual({ j0: read(paths.handles).j0Inherited, j1: read(paths.handles).j1Inherited }, { j0: false, j1: false });
      if (alive(owned[0].pid) && creation(owned[0].pid) === owned[0].created) killOwned(owned[0]);
    } else {
      await until(() => existsSync(paths.grandchildReady));
      const grandchild = read(paths.grandchildReady); const created = creation(grandchild.pid);
      if (!created) throw new Error('Cannot verify test-created grandchild');
      owned.push({ pid: grandchild.pid, created });
      await until(()=>existsSync(paths.wrapperSpec+'.membership.json'));
      const membership=read(paths.wrapperSpec+'.membership.json');
      assert.equal(membership.pid,worker.pid);assert.equal(membership.j0Member,true);assert.equal(membership.j1Member,true);
      if (scenario === 'step_timeout' || scenario === 'wrapper_step_deadline_only') {
        await until(() => existsSync(paths.wrapperDone)); assert.equal(read(paths.wrapperDone).reason, 'wrapper_step_deadline');
        assert.ok(alive(parent.pid), 'Node remains alive: wrapper alone must enforce its deadline');
        assert.equal(read(paths.wrapperDone).empty, true);assert.equal(read(paths.wrapperDone).action,'terminate_J1');assert.ok(Date.parse(read(paths.wrapperDone).at));killOwned(owned[0]);
      } else if (totalOnly) {
        await until(() => existsSync(paths.launcherDone), 12000);
        assert.equal(read(paths.launcherDone).reason, 'launcher_total_deadline');
        assert.equal(read(paths.launcherDone).empty, true);assert.equal(read(paths.launcherDone).action,'terminate_J0');assert.ok(Date.parse(read(paths.launcherDone).at));
      } else if (scenario === 'hard_kill_wrapper') {
        const wrapper = owned.find(row => row.pid !== parent.pid && row.pid !== worker.pid && row.pid !== grandchild.pid && row.pid !== launcher.pid);
        assert.ok(wrapper); killOwned(wrapper); await until(() => !alive(worker.pid) && !alive(grandchild.pid));
        await until(()=>existsSync(paths.wrapperSpec+'.reply.json'));
        const drained=read(paths.wrapperSpec+'.reply.json');assert.equal(drained.drainedBeforeFallback,true);assert.equal(drained.action,'observe_Jw_empty');
        killOwned(owned[0]);
      } else if (scenario === 'hard_kill_launcher' || scenario === 'detached_grandchild') killOwned(owned[0]);
      else if (scenario === 'hard_kill_node_and_launcher') { killOwned(owned[0]); if (alive(owned[1].pid) && creation(owned[1].pid) === owned[1].created) killOwned(owned[1]); }
      else {
        killOwned(owned[1]);
        await until(() => existsSync(wrapperOnly ? paths.wrapperDone : paths.launcherDone));
        if (wrapperOnly) {
          assert.equal(read(paths.wrapperDone).reason,'wrapper_parent_death');assert.equal(read(paths.wrapperDone).empty,true);
          assert.equal(read(paths.wrapperDone).action,'terminate_J1');assert.equal(read(paths.wrapperDone).parentWatchDisabled,false);assert.ok(Date.parse(read(paths.wrapperDone).at));
        } else {
          assert.equal(read(paths.launcherDone).reason,'node_exited');assert.equal(read(paths.launcherDone).action,'terminate_J0');
          assert.equal(read(paths.launcherDone).launcherExitWatchDisabled,false);assert.ok(Date.parse(read(paths.launcherDone).at));
        }
      }
    }
    await until(() => owned.every(row => !alive(row.pid)), 9000);
    console.log(JSON.stringify({ scenario, result: 'PASS', scratch, verifiedOwned: owned.length,
      processSnapshot: owned.map(row => ({ ...row, alive: alive(row.pid) })),
      jobRecords: Object.fromEntries(['launcherReady', 'launcherDone', 'wrapperReady', 'wrapperDone'].map(name => [name, existsSync(paths[name]) ? read(paths[name]) : 'owner killed before record'])) }));
  } catch (error) {
    console.error(JSON.stringify({ scenario, scratch, stderr, artifacts: Object.fromEntries(['launcherDone', 'wrapperDone', 'wrapperError'].map(name => [name, existsSync(paths[name]) ? readFileSync(paths[name], 'utf8') : 'missing'])), workerError: existsSync(join(scratch, 'worker.stderr')) ? readFileSync(join(scratch, 'worker.stderr'), 'utf8') : 'missing' }));
    throw error;
  } finally {
    for (const row of owned) { try { killOwned(row); } catch (error) { console.error(`Owned-process cleanup could not be verified for PID ${row.pid}, created ${row.created}: ${error.message}`); } }
  }
});
test('windows.shutdown.detected_wmi_escape', {skip:operatorSkipReason()},()=>runOperatorCase('detected_wmi_escape'));
test('windows.shutdown.console_close', {skip:operatorSkipReason()},()=>runOperatorCase('console_close'));
test('windows.shutdown.owner_interrupt', {skip:operatorSkipReason()},()=>runOperatorCase('owner_interrupt'));
