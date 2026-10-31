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
  } catch (error) { throw fault('LOCK_INSPECTION_FAILED', `Process probe unavailable (${error.code || error.status})`); }
}
export function inspector(directory) {
  return pid => processProbe({ action: 'inspect', pids: [pid] }, directory).processes[0];
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
