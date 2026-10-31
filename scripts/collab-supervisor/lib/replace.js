import { renameSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fault } from './policy.js';

// Windows readers without FILE_SHARE_DELETE can briefly deny atomic replacement.
// Keep the original target throughout; retain the temporary file on failure.
export function replaceCheckpoint(temporary, path, rename = renameSync) {
  const deadline = performance.now() + 1000;
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  for (;;) {
    try { rename(temporary, path); return; }
    catch (error) {
      const remaining = deadline - performance.now();
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || remaining <= 0) {
        throw fault('EVIDENCE_WRITE', `${path}: rename failed (${error.code || error.message})`);
      }
      Atomics.wait(sleeper, 0, 0, Math.min(25, remaining));
    }
  }
}
