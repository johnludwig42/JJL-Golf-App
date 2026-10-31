import { readFileSync, existsSync, openSync, writeFileSync, fsyncSync, closeSync } from 'node:fs';
import { fault, hash } from './policy.js';
import { Buffer } from 'node:buffer';
export function records(path) {
  if (!existsSync(path)) return [];
  let previous = '';
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line, index) => {
    const row = JSON.parse(line);
    if (row.sequence !== index + 1 || row.prevRecordSha256 !== previous) throw fault('INTEGRITY');
    previous = hash(Buffer.from(line)); return row;
  });
}
export function recordApproval(path, row, { tty = false, marker = false, ancestry = [], enteredId, enteredPhase } = {}) {
  if (!tty || marker || ancestry.some(name => /codex|claude|supervisor/i.test(name))) throw fault('NOT_APPROVED');
  if (enteredId !== row.packageId || enteredPhase !== row.phase) throw fault('NOT_APPROVED');
  const prior = records(path);
  const record = { ...row, sequence: prior.length + 1, approvedBy: row.synthetic===true ? 'Synthetic Phase A fixture (not owner approval)' : 'John (recorded; identity not verified)', prevRecordSha256: prior.length ? hash(Buffer.from(JSON.stringify(prior.at(-1)))) : '' };
  const fd = openSync(path, 'a');
  try { writeFileSync(fd, JSON.stringify(record) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
  return record;
}
export function verifyApproval(record, sourceBytes, approvedBytes, identity) {
  if (!record || record.packageHash !== hash(sourceBytes) || record.packageHash !== hash(approvedBytes)) throw fault('NOT_APPROVED');
  if (record.packageId !== identity.packageId || record.baseSha !== identity.baseSha || record.phase !== identity.phase || record.bundle !== identity.bundle) throw fault('NOT_APPROVED');
  return true;
}
