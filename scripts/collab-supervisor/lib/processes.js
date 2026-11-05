import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { fault } from './policy.js';
const probe = new URL('../process-probe.ps1', import.meta.url);
export function processProbe(request, directory) {
  if (process.platform !== 'win32') throw fault('ISOLATION', 'Windows process inspection required');
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `probe-${randomUUID()}.json`);
  writeFileSync(path, JSON.stringify(request), { flag: 'wx' });
  const ps = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  try {
    const text = execFileSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(probe), '-Request', path], { windowsHide: true, encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (error) { throw fault('LOCK_INSPECTION_FAILED', `Process probe unavailable (${error.code || error.status}; ${error.syscall || 'decode'}; ${error.path || ps})`); }
}
export function inspector(directory) {
  return pid => processProbe({ action: 'inspect', pids: [pid] }, directory).processes[0];
}
export function ancestry(pid,directory) {
  // Synthetic consent checks only caller and immediate parent, not an owner identity.
  const result=processProbe({action:'ancestry',pid,limit:2},directory);
  if(result.result!=='PASS' || result.limit!==2 || !Array.isArray(result.processes) || !result.processes.length || result.processes[0].pid!==pid)throw fault('LOCK_INSPECTION_FAILED','Unknown ancestry');
  const seen=new Set();
  for(const row of result.processes){
    if(!Number.isInteger(row.pid)||row.pid<=0||seen.has(row.pid)||!Number.isInteger(row.parentPid)||row.parentPid<0||typeof row.name!=='string'||!row.name||!(/^[1-9][0-9]{0,18}$/).test(row.createdAt))throw fault('LOCK_INSPECTION_FAILED','Malformed ancestry');
    seen.add(row.pid);
  }
  return result.processes;
}
// Enumeration and termination are deliberately separated: no marker match alone
// authorizes a kill. The second inspection must match the captured creation time.
export function sweepMarked({ marker, fixture, startedAt, enumerate, inspect, terminate, isMember = () => false }) {
  const result = enumerate();
  if (!result || result.result !== 'PASS') return { result: 'NOT_RUN', reason: result?.reason || 'Enumeration unavailable', escapes: [], survivors: [] };
  const escapes = [], survivors = [];
  for (const row of result.processes) {
    if (row.marker !== marker || row.fixture !== fixture || row.startedAt < startedAt || isMember(row)) continue;
    const current = inspect(row.pid);
    if (!current || current.unknown) { survivors.push({ ...row, reason: 'inspection failed' }); continue; }
    if (!current.alive) continue;
    if (String(current.createdAt) !== String(row.createdAt)) { survivors.push({ ...row, reason: 'PID reused' }); continue; }
    escapes.push({ pid: row.pid, createdAt: row.createdAt, detectedEscape: true });
    if (!terminate(row)) survivors.push({ ...row, reason: 'termination unconfirmed' });
  }
  return { result: survivors.length ? 'FAIL' : 'PASS', escapes, survivors };
}
export function realSweep(config, directory) {
  const found = processProbe({ action: 'enumerate', marker: config.marker, fixture: config.fixture, startedAt: config.startedAt }, directory);
  return sweepMarked({ ...config, enumerate: () => found,
    inspect: inspector(directory), terminate: row => processProbe({ action: 'terminate', pid: row.pid, createdAt: row.createdAt }, directory).terminated === true });
}
export function readJson(path) { return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')); }

export function probeJobMembership(process, records) {
  if (!process || !Number.isInteger(process.pid) || !/^[1-9][0-9]{0,18}$/.test(process.createdAt ?? '') ||
      !Array.isArray(records)) return null;
  const valid = row => {
    const sample = row?.sample;
    if (row?.status !== 'OK' || !sample || !Array.isArray(sample.members) ||
        sample.members.length !== sample.activeProcesses || sample.members.length > 256) return false;
    const start = Date.parse(sample.startUtc), end = Date.parse(sample.endUtc);
    return Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start <= 100 &&
      new Set(sample.members.map(member => member.pid)).size === sample.members.length &&
      sample.members.every(member => Number.isInteger(member.pid) && member.pid > 0 &&
        /^[1-9][0-9]{0,18}$/.test(member.createdFiletime ?? ''));
  };
  const outer = records.filter(row => row.job === 'J0');
  const final = outer.at(-1);
  if (!valid(final) || final.phase !== 'final' || final.sample.activeProcesses !== 0) return null;
  for (const job of ['J1', 'J0']) {
    const member = records.find(row => row.job === job && valid(row) &&
      row.sample.members.some(item => item.pid === process.pid && item.createdFiletime === process.createdAt));
    if (member) return { membership: job, job, seq: member.seq };
  }
  const createdMs = Number(BigInt(process.createdAt) / 10000n - 11644473600000n);
  const observed = Date.parse(process.observedAliveAt);
  if (!Number.isFinite(observed)) return null;
  const excluded = outer.find(row => valid(row) && Date.parse(row.sample.startUtc) > createdMs &&
    Date.parse(row.sample.endUtc) < observed && !row.sample.members.some(item => item.pid === process.pid));
  return excluded ? { membership: 'neither', job: 'J0', seq: excluded.seq } : null;
}

// Observations classify a run; this function never terminates a process.
export function assessProbeAttribution({ baseline, enumerationComplete, processes, expectedNonce }) {
  if (!Array.isArray(baseline) || !enumerationComplete || !Array.isArray(processes)) {
    return { result: 'NOT_RUN', reason: 'attribution incomplete' };
  }
  if (baseline.length) return { result: 'NOT_RUN', reason: 'sandbox users busy' };
  const incomplete = [];
  const survivors = [];
  const unattributed = [];
  for (const row of processes) {
    const nonceBound = Object.hasOwn(row, 'nonce') || row.nonceVerified === true;
    const nonceComplete = !nonceBound || (row.nonceVerified === true &&
      /^[a-f0-9]{32}$/.test(expectedNonce ?? '') && row.nonce === expectedNonce);
    const complete = nonceComplete && Number.isInteger(row.pid) && row.pid > 0 &&
      Number.isInteger(row.parentPid) && row.parentPid > 0 &&
      /^[1-9][0-9]{0,18}$/.test(row.createdAt ?? '') &&
      /^[1-9][0-9]{0,18}$/.test(row.parentCreatedAt ?? '') &&
      BigInt(row.parentCreatedAt) <= BigInt(row.createdAt) &&
      typeof row.image === 'string' && row.image.length > 0 &&
      /^[A-Fa-f0-9]{64}$/.test(row.imageSha256 ?? '') &&
      /^S-1-[0-9-]+$/.test(row.ownerSid ?? '') &&
      ['J0', 'J1', 'neither'].includes(row.membership) && typeof row.alive === 'boolean' && !row.error;
    if (!complete) incomplete.push(row);
    const attributed = complete && (row.membership !== 'neither' ||
      (row.nonceVerified === true && row.chainVerified === true &&
       nonceBound && nonceComplete));
    if (row.alive === true && attributed) survivors.push(row);
    if (row.alive === true && complete && !attributed) unattributed.push(row);
  }
  if (survivors.length || unattributed.length || incomplete.some(row => row.alive === true)) {
    return { result: 'FAIL', reason: unattributed.length ? 'UNATTRIBUTED' : 'surviving process', survivors, unattributed, incomplete };
  }
  if (incomplete.length) return { result: 'NOT_RUN', reason: 'attribution incomplete', incomplete };
  return { result: 'PASS', survivors, unattributed, incomplete };
}
