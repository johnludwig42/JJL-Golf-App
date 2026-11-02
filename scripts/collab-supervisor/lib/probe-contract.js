// Stage 1a: synthetic contracts only. There is deliberately no live resolver.
import { readFileSync, lstatSync, realpathSync, existsSync, openSync, writeFileSync, fsyncSync, closeSync } from 'node:fs';
import { win32 } from 'node:path';
import { TextDecoder } from 'node:util';
import { Buffer } from 'node:buffer';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { fault, hash } from './policy.js';
import { remaining } from './budget.js';

export const PROBE_REGISTRY = Object.freeze({
  version: Object.freeze({ scenario: 'probe-version', stage: 'synthetic', realResult: 'UNVERIFIED' }),
  auth: Object.freeze({ scenario: 'probe-auth', stage: 'synthetic', realResult: 'UNVERIFIED' }),
  refusal: Object.freeze({ scenario: 'probe-refusal', stage: 'synthetic', realResult: 'UNVERIFIED' })
});
// Descriptions only: no executable template, resolver or live adapter exists.
export const REAL_PROBE_REQUIREMENTS = Object.freeze(Object.fromEntries([
  ['B0','Reviewed setup and original-ACL capture','1b'],
  ['B1','Real descendant containment and escape sweep','2'],
  ['B2','Protected control bundle, approvals and file boundaries','2'],
  ['B3','Protected synthetic sentinel reads denied without real-secret enumeration','2'],
  ['B4','Separately approved loopback and external network controls','2'],
  ['B5','Codex model-probe file, commit, patch, network and tool confinement','3'],
  ['B6','Claude tool and MCP confinement','3'],
  ['B7','Reviewed installed versions/auth preflight and model metadata corroboration','2+3'],
  ['B8','Owner-run real-tool shutdown proof','3']
].map(([id,evidence,stage])=>[id,Object.freeze({evidence,stage,result:'UNVERIFIED'})])));
export const REGISTRY_HASH = hash(JSON.stringify({synthetic:PROBE_REGISTRY,realRequirements:REAL_PROBE_REQUIREMENTS}));
const keys = new Set(('schema type mode run_id request_id probe_id manifest_hash request_hash registry_hash config_hash config_path transport_path transport_hash executable executable_hash fixture fixture_hash cwd stdout stderr ready done steps_dir total_ms grace_ms marker started_at owner_stop agent_fixture parent_pid parent_created launcher_pid launcher_created wrapper_pid wrapper_created coordinator_pid coordinator_created deadline_utc step_ms lock_path consume_path receipt_path manifest_path argv_count env_count approval_hash release').split(' '));
const integers = new Set('schema total_ms grace_ms started_at parent_pid launcher_pid wrapper_pid coordinator_pid deadline_utc step_ms argv_count env_count'.split(' '));
const pathKeys = new Set('config_path transport_path executable fixture cwd stdout stderr ready done steps_dir owner_stop agent_fixture lock_path consume_path receipt_path manifest_path release'.split(' '));
const shaKeys = new Set('manifest_hash request_hash registry_hash config_hash transport_hash executable_hash fixture_hash approval_hash'.split(' '));
const enums = { mode: ['fake'], type: ['manifest', 'request', 'consumption', 'started', 'vector'] };
const requireThat = (ok, message) => { if (!ok) throw fault('INTEGRITY', message); };
keys.add('repository'); pathKeys.add('repository');
for(const key of ['powershell_executable','git_executable']){keys.add(key);pathKeys.add(key);}
for(const key of ['powershell_hash','git_hash']){keys.add(key);shaKeys.add(key);}

export function probeMode(mode) {
  if (mode !== 'fake') throw fault('NOT_PLATFORM_ACCEPTED', 'Stage 1a has no live probe backend');
}
export function pathTuple(path, { output = false } = {}) {
  return inspectPath(path, output, false);
}
function inspectPath(path, output, systemPowerShell) {
  requireThat(typeof path === 'string' && /^[A-Za-z]:[\\/]/.test(path) && /^[\x20-\x7e]+$/.test(path), 'Drive-absolute ASCII path required');
  const normalized = path.replaceAll('/', '\\');
  const parts = normalized.slice(3).split('\\');
  requireThat(!parts.some(p => !p || p === '.' || p === '..' || /[. ]$|[:*?"<>|]|~[0-9]/.test(p)), 'Ambiguous path spelling');
  requireThat(win32.normalize(normalized) === normalized, 'Noncanonical path');
  let current = normalized.slice(0, 3);
  for (let i = 0; i < parts.length; i++) {
    current = win32.join(current, parts[i]);
    if (!existsSync(current)) {
      requireThat(output && i === parts.length - 1, 'Missing path component');
      break;
    }
    const info = lstatSync(current);
    const fixedRuntime = systemPowerShell && i === parts.length - 1;
    requireThat(!info.isSymbolicLink() && (!info.isFile() || info.nlink === 1 ||
      (fixedRuntime && Number.isInteger(info.nlink) && info.nlink > 1)), 'Linked path refused');
    if (fixedRuntime) requireThat(info.isFile() && info.nlink >= 1, 'Regular system PowerShell file required');
    requireThat(realpathSync.native(current).toUpperCase() === current.toUpperCase(), 'Redirected or short path refused');
    if (i < parts.length - 1) requireThat(info.isDirectory(), 'Parent is not a directory');
  }
  return normalized.toUpperCase();
}

// The sole link-count exception is selected here, never by caller-supplied roles
// or manifest flags. Generic pathTuple/regular remain strict.
export function systemPowerShellPath({ repository, evidenceRoot } = {}) {
  const root=process.env.SystemRoot;
  requireThat(typeof root==='string' && /^[A-Za-z]:\\/.test(root),'SystemRoot required');
  const expected=win32.join(root,'System32','WindowsPowerShell','v1.0','powershell.exe');
  const project=fileURLToPath(new URL('../../../',import.meta.url));
  for(const denied of [tmpdir(),homedir(),process.env.USERPROFILE,project,repository,evidenceRoot].filter(Boolean)){
    const rel=win32.relative(win32.resolve(denied),expected);
    requireThat(rel!=='' && (rel.startsWith('..\\') || rel==='..' || win32.isAbsolute(rel)), 'Untrusted system PowerShell location');
  }
  inspectPath(expected,false,true);
  return expected;
}
function powerShellTuple(value) {
  const expected=systemPowerShellPath();
  requireThat(value===expected,'Exact system PowerShell spelling required');
  return expected.toUpperCase();
}

export function canonicalWire(row) {
  const sorted = Object.fromEntries(Object.keys(row).sort().map(key => [key, row[key]]));
  const bytes = Buffer.from(JSON.stringify(sorted) + '\n');
  parseWire(bytes, { paths: false });
  return bytes;
}
export function parseWire(bytes, { paths = true } = {}) {
  // Validate tokens before interpreting JSON: duplicate/case-folded keys never disappear.
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  requireThat(text.length <= 65536 && text.endsWith('\n') && !text.includes('\r'), 'Wire framing');
  const string = '"(?:[\\x20-\\x21\\x23-\\x5b\\x5d-\\x7e]|\\\\["\\\\])*"';
  const field = new RegExp('"([a-z][a-z0-9_]*)":(' + string + '|0|[1-9][0-9]*)', 'y');
  requireThat(text[0] === '{', 'Wire object required');
  let position = 1, previous = ''; const row = Object.create(null);
  while (text[position] !== '}') {
    field.lastIndex = position; const match = field.exec(text);
    requireThat(match && match.index === position, 'Noncanonical token');
    const [, key, token] = match;
    requireThat(key > previous && (keys.has(key) || /^(argv_[0-9]{4}|env_[0-9]{4}_(name|value))$/.test(key)), 'Unknown, duplicate or unsorted field');
    previous = key; position = field.lastIndex;
    const value = JSON.parse(token);
    const numeric = integers.has(key);
    requireThat(numeric ? Number.isSafeInteger(value) && value >= 0 : typeof value === 'string', 'Wrong field type or range');
    if (key === 'schema') requireThat(value === 1, 'Unknown wire schema');
    if (['argv_count', 'env_count'].includes(key)) requireThat(value <= 32, 'Indexed field limit');
    if (['total_ms', 'step_ms'].includes(key)) requireThat(value >= 1 && value <= 120000, 'Synthetic time limit');
    if (key === 'grace_ms') requireThat(value <= 2000, 'Grace limit');
    if (shaKeys.has(key)) requireThat(/^[A-F0-9]{64}$/.test(value), 'Hash spelling');
    if (key.endsWith('_created')) requireThat(/^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n, 'FILETIME spelling');
    if (enums[key]) requireThat(enums[key].includes(value), 'Unknown enum');
    if (key === 'probe_id') requireThat(Object.hasOwn(PROBE_REGISTRY, value), 'Unknown probe');
    row[key] = paths && key==='powershell_executable' ? powerShellTuple(value) : paths && pathKeys.has(key) ? pathTuple(value, { output: !['powershell_executable','git_executable','repository', 'config_path', 'transport_path', 'executable', 'fixture', 'cwd', 'steps_dir', 'agent_fixture', 'manifest_path'].includes(key) }) : value;
    if (text[position] === ',') { position++; requireThat(text[position] !== '}', 'Trailing comma'); }
    else break;
  }
  requireThat(text.slice(position) === '}\n', 'Trailing data');
  requireThat(row.schema === 1 && row.mode === 'fake' && enums.type.includes(row.type), 'Required wire header');
  if(paths && Object.hasOwn(row,'powershell_executable'))requireThat(hash(readFileSync(systemPowerShellPath()))===row.powershell_hash,'System PowerShell hash mismatch');
  for (const prefix of ['argv', 'env']) {
    const count = row[prefix + '_count'] ?? 0;
    const names = Object.keys(row).filter(k => k.startsWith(prefix + '_') && k !== prefix + '_count');
    requireThat(names.length === count * (prefix === 'env' ? 2 : 1), 'Indexed field count');
    for (let i = 0; i < count; i++) {
      const stem = prefix + '_' + String(i).padStart(4, '0');
      requireThat(prefix === 'argv' ? Object.hasOwn(row, stem) : Object.hasOwn(row, stem + '_name') && Object.hasOwn(row, stem + '_value'), 'Indexed field gap');
    }
  }
  return row;
}
export function readWire(path, expectedHash, options) {
  pathTuple(path);
  const bytes = readFileSync(path);
  requireThat(!expectedHash || hash(bytes) === expectedHash, 'Wire hash mismatch');
  return parseWire(bytes, options);
}
export function writeWire(path, row) {
  pathTuple(path, { output: true });
  const bytes = canonicalWire(row), fd = openSync(path, 'wx');
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  return hash(bytes);
}
export function publishProbeRequest(path, row) {
  const sealed = writeWire(path, row);
  // Directory enumeration may see the request while its bytes are being written.
  // An empty exclusive completion marker is published only after fsync+close.
  // It is a visibility barrier, not authentication; the sealed hashes bind data.
  const fd = openSync(path + '.published', 'wx');
  try { fsyncSync(fd); } finally { closeSync(fd); }
  return sealed;
}
export function indexed(prefix, values) {
  return { [prefix + '_count']: values.length, ...Object.fromEntries(values.flatMap((value, i) => {
    const stem = prefix + '_' + String(i).padStart(4, '0');
    return prefix === 'env' ? [[stem + '_name', value[0]], [stem + '_value', value[1]]] : [[stem, value]];
  })) };
}
export function reserveAttempt(evidence, { budget, attempts, cap, requestId, probeId, now, binding }) {
  requireThat(Object.hasOwn(PROBE_REGISTRY, probeId) && Number.isInteger(cap) && cap >= 1 && cap <= 20, 'Synthetic cap');
  requireThat(!attempts.some(a => a.requestId === requestId), 'Request already reserved');
  if (attempts.length >= cap) throw fault('NOT_APPROVED', 'Synthetic attempt cap exhausted');
  if (remaining(budget, now) <= 0) throw fault('TIMEOUT');
  const row = Object.freeze({ requestId, probeId, reservedAt: now, deadline: budget.originalDeadlineUtc, binding, synthetic: true });
  // Append+fsync before returning permission to dispatch; failed/partial writes cannot launch.
  evidence.write('reservations/' + requestId + '.json', row);
  attempts.push(row); return row;
}
