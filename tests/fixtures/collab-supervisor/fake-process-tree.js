import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, openSync, closeSync } from 'node:fs';
const spec = JSON.parse(readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, ''));
writeFileSync(spec.ownReady, JSON.stringify({ pid: process.pid, marker: spec.marker }), { flag: 'wx' });
if (spec.wrapper) {
  const wait = setInterval(() => {
    if (!existsSync(spec.wrapperSpec)) return;
    clearInterval(wait);
    const errorFd = openSync(spec.wrapperError, 'wx');
    const child = spawn(spec.powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', spec.wrapper, '-SpecPath', spec.wrapperSpec, '-TestHarness'], { windowsHide: true, env: { ...process.env, DYE_SUPERVISOR_TEST: '1' }, stdio: ['ignore', 'ignore', errorFd] });
    closeSync(errorFd);
    writeFileSync(spec.wrapperPid, String(child.pid), { flag: 'wx' });
  }, 10);
}
if (spec.child) {
  const child = spawn(process.execPath, [spec.fixture, spec.child], { detached: !!spec.detached, windowsHide: true, stdio: 'ignore' });
  writeFileSync(spec.childPid, String(child.pid), { flag: 'wx' });
}
setInterval(() => {}, 1000);
