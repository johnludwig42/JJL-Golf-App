import { openSync, writeFileSync, fsyncSync, closeSync, readFileSync, mkdirSync, renameSync, linkSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fault } from './policy.js';
// Inspector returns {alive:true,createdAt}, {alive:false} for confirmed absence,
// or {unknown:true,reason}/null on failure. Identity is PID + canonical FILETIME.
const filetime = value => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
export function lockState(record, inspect) {
  for (const key of ['node', 'launcher']) {
    const expected = record?.[key];
    if (!Number.isInteger(expected?.pid) || !expected.createdAt) return 'LOCK_DAMAGED';
    const actual = inspect(expected.pid);
    if (!actual || actual.unknown) throw fault('LOCK_INSPECTION_FAILED', actual?.reason || 'No inspection result');
    if (actual.alive === true) {
      if (!filetime(expected.createdAt) || !filetime(actual.createdAt)) throw fault('LOCK_INSPECTION_FAILED', 'Canonical FILETIME strings required');
      if (actual.createdAt === expected.createdAt) return 'LOCK_HELD';
      continue; // Reused PID: the recorded owner is dead; never touch its new occupant.
    }
    if (actual.alive !== false) throw fault('LOCK_INSPECTION_FAILED');
  }
  return 'LOCK_STALE';
}
export function readLock(path) {
  try {
    const row = JSON.parse(readFileSync(path, 'utf8'));
    if (!['node','launcher'].every(key=>Number.isInteger(row?.[key]?.pid)&&row[key].pid>0&&typeof row[key].createdAt==='string'&&row[key].createdAt.length>0)) throw new Error('Missing or malformed owner identities');
    return row;
  } catch (error) { throw fault('LOCK_DAMAGED', `Lock cannot be read: ${error.code || error.message}`); }
}
export function takeLock(path, record, inspect, { beforePublish = () => {} } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`; let fd;
  try {
    fd = openSync(temporary, 'wx'); writeFileSync(fd, JSON.stringify(record)); fsyncSync(fd); closeSync(fd); fd = undefined;
    beforePublish();
    try { linkSync(temporary, path); }
    catch (error) { if (error.code !== 'EEXIST') throw error; throw fault(lockState(readLock(path), inspect)); }
  } finally {
    if (fd !== undefined) closeSync(fd);
    // Only this call's transient file, never a published lock or prior evidence.
    try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
export function recoverLock(path, archive, { tty, inspect, survivors, damagedConfirmed = false }) {
  if (!tty) throw fault('NOT_APPROVED');
  let record;
  try { record = readLock(path); } catch (error) { if (error.code !== 'LOCK_DAMAGED' || !damagedConfirmed) throw error; }
  if (record && lockState(record, inspect) !== 'LOCK_STALE') throw fault('LOCK_HELD');
  // The real adapter throws if enumeration is denied; it must not return [].
  if (survivors().length) throw fault('ISOLATION');
  mkdirSync(dirname(archive), { recursive: true }); renameSync(path, archive);
  return record || { damaged: true, ownerConfirmed: true };
}
